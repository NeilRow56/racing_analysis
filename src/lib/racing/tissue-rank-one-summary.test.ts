import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderDailyPositiveTissueRankOneSummary, renderTissuePositiveEdgeRankOnePerformance, summarizeTissuePositiveEdgeRankOnePerformance, TISSUE_VALUE_DISPLAY_EPOCH } from "./forward-value-summary";
import {
  FORWARD_VALUE_MARKET_PRICE_BASIS_IMPLEMENTED_AT,
  FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
  FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
  FORWARD_VALUE_SETTLEMENT_VERSION,
  type ForwardValueRecord,
  type ValueFamily,
} from "./forward-value";
import { TISSUE_V2_CONFIG, type TissueForwardData, type TissueForwardRace } from "./tissue-forward";
import { AW_TISSUE_IMPLEMENTED_AT, AW_TISSUE_SCHEMA, AW_TISSUE_VERSION } from "./aw-tissue-model";
import { type AwTissueForwardData, type AwTissueRace, AW_TISSUE_FORWARD_VERSION } from "./aw-tissue-forward";
import { JUMP_TISSUE_IMPLEMENTED_AT, JUMP_TISSUE_SCHEMA, JUMP_TISSUE_VERSION } from "./jump-tissue-model";
import { type JumpTissueForwardData, type JumpTissueRace, JUMP_TISSUE_FORWARD_VERSION } from "./jump-tissue-forward";
import type { SportingLifeCurrentPrice } from "./todays-racing";

test("daily positive-edge Tissue rank-1 summary covers Turf, Jump and AW with shared median-bookmaker logic", () => {
  const turf = turfData([
    turfRace("turf-late", "14:00", "Ascot", "By The Book", .31),
    turfRace("turf-early", "13:50", "Ascot", "Fluorescence", .30),
    turfRace("turf-zero", "15:00", "Ascot", "Zero Edge", .20),
    turfRace("turf-forecast", "15:30", "Ascot", "Forecast Only", .40),
  ]);
  const jump = jumpData([
    jumpRace("jump-positive", "14:30", "Gowran Park", "Jump Horse", .26),
    jumpRace("jump-negative", "15:10", "Gowran Park", "Jump Negative", .10),
  ]);
  const aw = awData([
    awRace("aw-positive", "15:16", "Wolverhampton", "AW Horse", .40),
    awRace("aw-missing", "16:00", "Wolverhampton", "AW Missing", .40),
  ]);
  const before = JSON.stringify({ turf, jump, aw });

  const output = renderDailyPositiveTissueRankOneSummary({
    date: "2026-10-03",
    turf,
    jump,
    aw,
    currentPrices: [
      price("turf-late", "turf-late-runner", "7/2", 4.5, 5, "14:00"),
      price("turf-early", "turf-early-runner", "4/1", 5, 3, "13:50"),
      price("turf-zero", "turf-zero-runner", "4/1", 5, 3, "15:00"),
      price("turf-forecast", "turf-forecast-runner", null, null, 0, "15:30", "4/1", 5),
      price("jump-positive", "jump-positive-runner", "3/1", 4, 4, "14:30"),
      price("jump-negative", "jump-negative-runner", "4/1", 5, 4, "15:10"),
      price("aw-positive", "aw-positive-runner", "7/2", 4.5, 2, "15:16"),
      price("aw-missing", "aw-missing-runner", null, null, 0, "16:00", "2/1", 3),
    ],
    currentRaceIds: new Set(["turf-late", "turf-early", "turf-zero", "turf-forecast", "jump-positive", "jump-negative", "aw-positive", "aw-missing"]),
  });

  assert.match(output, /TODAY'S TISSUE VALUE/);
  assert.match(output, /TURF\ntime \| course \| horse \| Tissue probability \| qualifying price\n13:50 \| Ascot \| Fluorescence \| 30\.0% \| 4\/1\n14:00 \| Ascot \| By The Book \| 31\.0% \| 7\/2/);
  assert.match(output, /JUMP\ntime \| course \| horse \| Tissue probability \| qualifying price\n14:30 \| Gowran Park \| Jump Horse \| 26\.0% \| 4\.00/);
  assert.match(output, /ALL WEATHER\ntime \| course \| horse \| Tissue probability \| qualifying price\n15:16 \| Wolverhampton \| AW Horse \| 40\.0% \| 4\.50/);
  assert.doesNotMatch(output, /Zero Edge|Jump Negative|AW Missing|Forecast Only/);
  assert.match(output, /TOTAL TISSUE VALUE\nSelections: 4/);
  assert.doesNotMatch(output, /Edge Buckets|Price Snapshots|Favourite Status|Rating Gap x Market Edge/);
  assert.equal(JSON.stringify({ turf, jump, aw }), before);
});

test("daily positive-edge Tissue rank-1 summary prints None for empty families", () => {
  const output = renderDailyPositiveTissueRankOneSummary({
    date: "2026-10-03",
    turf: turfData([]),
    jump: jumpData([]),
    aw: awData([]),
    currentPrices: [],
    currentRaceIds: new Set(),
  });

  assert.match(output, /TURF\nNone\n\nJUMP\nNone\n\nALL WEATHER\nNone/);
  assert.match(output, /TOTAL TISSUE VALUE\nSelections: 0/);
});

test("daily summary formats cached Jump and AW UTC instants when current cards are absent", () => {
  const jump = jumpRace("jump-clock", "13:00", "Chepstow", "Jump Clock", .4);
  jump.recordedAt = "2026-10-03T09:00:00Z";
  jump.prices.early!.capturedAt = jump.recordedAt;
  const output = renderDailyPositiveTissueRankOneSummary({
    date: "2026-10-03", turf: turfData([]),
    jump: jumpData([jump]),
    aw: awData([awRace("aw-clock", "13:00", "Southwell", "AW Clock", .4)]),
    currentPrices: [],
  });
  assert.match(output, /14:00 \| Chepstow \| Jump Clock/);
  assert.match(output, /14:00 \| Southwell \| AW Clock/);
  assert.doesNotMatch(output, /13:00 \|/);
});

test("Turf summary converts the source UTC clock when a current price has no display time", () => {
  const output = renderDailyPositiveTissueRankOneSummary({
    date: "2026-10-03", turf: turfData([turfRace("turf-clock", "13:00", "York", "Turf Clock", .4)]),
    jump: jumpData([]), aw: awData([]),
    currentPrices: [price("turf-clock", "turf-clock-runner", "4/1", 5, 2, "")],
  });
  assert.match(output, /14:00 \| York \| Turf Clock/);
});

test("Tissue positive-edge rank-1 performance summarizes family and combined settled returns", () => {
  const output = renderTissuePositiveEdgeRankOnePerformance([
    forwardValueRecord({ raceId: "turf-win", family: "turf", tissueEdgePercentagePoints: 10, tissueCapturedDecimalOdds: 5, winnerRunnerIds: ["turf-win-tissue"] }),
    forwardValueRecord({ raceId: "turf-loss", family: "turf", tissueEdgePercentagePoints: 2, tissueCapturedDecimalOdds: 4, winnerRunnerIds: ["other"] }),
    forwardValueRecord({ raceId: "turf-pending", family: "turf", tissueEdgePercentagePoints: 1, tissueCapturedDecimalOdds: 3, settled: false }),
    forwardValueRecord({ raceId: "jump-win", family: "jump", tissueEdgePercentagePoints: 3, tissueCapturedDecimalOdds: 3, winnerRunnerIds: ["jump-win-tissue"] }),
    forwardValueRecord({ raceId: "jump-negative", family: "jump", tissueEdgePercentagePoints: -1, tissueCapturedDecimalOdds: 5, winnerRunnerIds: ["jump-negative-tissue"] }),
    forwardValueRecord({ raceId: "aw-missing-price", family: "aw", tissueEdgePercentagePoints: 5, tissueCapturedDecimalOdds: null, winnerRunnerIds: ["aw-missing-price-tissue"] }),
  ], {
    jump: jumpTrackerData([
      trackerRace({ raceId: "jump-tracker-win", edge: 3, price: 3, won: true, profitLoss: 2 }),
      trackerRace({ raceId: "jump-tracker-negative", edge: -1, price: 5, won: true, profitLoss: 4 }),
    ]),
    aw: awTrackerData([
      trackerRace({ raceId: "aw-tracker-win", edge: 5, price: 2.5, won: true, profitLoss: 1.5 }),
      trackerRace({ raceId: "aw-tracker-pending", edge: 4, price: 4, won: null, profitLoss: null, settled: false }),
    ]),
  }, { epoch: null });

  assert.equal(output, [
    "Tissue positive-edge rank-1 performance",
    "Full historical display",
    "",
    "Turf",
    "Selections: 3",
    "Settled: 2",
    "Winners: 1",
    "Strike: 50.0%",
    "£1 P/L: £3.00",
    "ROI: 150.0%",
    "",
    "Jump",
    "Selections: 1",
    "Settled: 1",
    "Winners: 1",
    "Strike: 100.0%",
    "£1 P/L: £2.00",
    "ROI: 200.0%",
    "",
    "All Weather",
    "Selections: 2",
    "Settled: 1",
    "Winners: 1",
    "Strike: 100.0%",
    "£1 P/L: £1.50",
    "ROI: 150.0%",
    "",
    "Combined",
    "Selections: 6",
    "Settled: 4",
    "Winners: 3",
    "Strike: 75.0%",
    "£1 P/L: £6.50",
    "ROI: 162.5%",
  ].join("\n"));
});

test("Tissue VALUE display epoch starts a clean priced cohort while historical evidence remains available", () => {
  const historicalTurf = forwardValueRecord({ raceId: "turf-old", raceDate: "2026-10-10", family: "turf", tissueEdgePercentagePoints: 10, tissueCapturedDecimalOdds: 6, winnerRunnerIds: ["turf-old-tissue"] });
  const epochTurf = forwardValueRecord({ raceId: "turf-epoch", raceDate: TISSUE_VALUE_DISPLAY_EPOCH, family: "turf", tissueEdgePercentagePoints: 10, tissueCapturedDecimalOdds: 5, winnerRunnerIds: ["turf-epoch-tissue"] });
  const jump = jumpTrackerData([
    trackerRace({ raceId: "jump-old", raceDate: "2026-10-10", edge: 4, price: 4, won: true, profitLoss: 3 }),
    trackerRace({ raceId: "jump-epoch", raceDate: TISSUE_VALUE_DISPLAY_EPOCH, edge: 4, price: 4, won: false, profitLoss: -1 }),
  ]);
  const aw = awTrackerData([
    trackerRace({ raceId: "aw-old", raceDate: "2026-10-10", edge: 4, price: 5, won: true, profitLoss: 4 }),
    trackerRace({ raceId: "aw-epoch", raceDate: TISSUE_VALUE_DISPLAY_EPOCH, edge: 4, price: 3, won: true, profitLoss: 2 }),
  ]);

  const clean = summarizeTissuePositiveEdgeRankOnePerformance([historicalTurf, epochTurf], { jump, aw });
  const historical = summarizeTissuePositiveEdgeRankOnePerformance([historicalTurf, epochTurf], { jump, aw }, { epoch: null });

  assert.deepEqual(clean.map(({ label, selections, settled, winners, profitLoss, roi }) => ({ label, selections, settled, winners, profitLoss, roi })), [
    { label: "Turf", selections: 1, settled: 1, winners: 1, profitLoss: 4, roi: 4 },
    { label: "Jump", selections: 1, settled: 1, winners: 0, profitLoss: -1, roi: -1 },
    { label: "All Weather", selections: 1, settled: 1, winners: 1, profitLoss: 2, roi: 2 },
    { label: "Combined", selections: 3, settled: 3, winners: 2, profitLoss: 5, roi: 5 / 3 },
  ]);
  assert.equal(historical.find((row) => row.label === "Turf")?.selections, 2);
  assert.equal(historical.find((row) => row.label === "Jump")?.selections, 2);
  assert.equal(historical.find((row) => row.label === "All Weather")?.selections, 2);
});

test("clean Tissue VALUE cohort reports missing stored returns explicitly", () => {
  const output = renderTissuePositiveEdgeRankOnePerformance([], {
    jump: jumpTrackerData([trackerRace({ raceId: "jump-missing", raceDate: TISSUE_VALUE_DISPLAY_EPOCH, edge: 4, price: 4, won: true, profitLoss: null })]),
    aw: awTrackerData([]),
  });

  assert.match(output, /Clean priced prospective record from 11 Oct 2026/);
  assert.match(output, /Jump\nSelections: 1\nSettled: 1\nWinners: 1\nStrike: 100\.0%\n£1 P\/L: -\nROI: -\n1 return unavailable/);
});

test("value scripts keep concise today and split Jump/AW detail from terminal summary", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["value:today"], "bun run scripts/report-forward-value.ts today");
  assert.equal(packageJson.scripts["value:summary"], "bun run scripts/report-forward-value.ts summary");

  const source = readFileSync("scripts/report-forward-value.ts", "utf8");
  assert.match(source, /loadCleanTissueValuePerformanceReport\(\)/);
  assert.match(source, /console\.log\(daily\.output\)/);
  assert.match(source, /console\.log\(renderTissueValueResultsSummary\(\{/);
  assert.match(source, /loadDailyPositiveTissueRankOneReport\(today\)/);
  assert.match(source, /# Forward Value Framework - Phase 2/);
  assert.match(source, /printEdgeBuckets\(cleanSettled\)/);
  assert.match(source, /printGapEdgeCrossTab\(cleanSettled, familyCalibration\)/);
  assert.match(source, /printFavouriteComparison\(cleanSettled\)/);
  assert.match(source, /renderJumpAwTerminalSummary\(jumpAwReport, options\)/);
  assert.match(source, /Detailed Jump\/AW report: \$\{jumpAwReportPath\}/);
});

function forwardValueRecord(input: {
  raceId: string;
  raceDate?: string;
  family: ValueFamily;
  tissueEdgePercentagePoints: number;
  tissueCapturedDecimalOdds: number | null;
  winnerRunnerIds?: string[];
  settled?: boolean;
}): ForwardValueRecord {
  const settled = input.settled ?? true;
  const raceDate = input.raceDate ?? "2026-10-03";
  return {
    family: input.family,
    raceId: input.raceId,
    raceDate,
    raceDateTime: `${raceDate}T13:00:00.000Z`,
    raceTime: "13:00",
    course: "Test",
    raceName: null,
    ratingVersion: "rating-v1",
    calibrationVersion: "calibration-v1",
    recordedAt: `${raceDate}T10:00:00.000Z`,
    recordedPreRace: true,
    captureMode: "live_sync",
    settlementVersion: FORWARD_VALUE_SETTLEMENT_VERSION,
    phase2ExclusionReason: null,
    leaderRunnerId: `${input.raceId}-leader`,
    leaderHorseName: "Leader",
    leaderRank: 1,
    leaderScore: 1,
    leaderGap: null,
    calibratedProbability: .25,
    capturedPrice: null,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
    marketPriceBasisImplementedAt: FORWARD_VALUE_MARKET_PRICE_BASIS_IMPLEMENTED_AT,
    forecastPrice: null,
    forecastDecimalPrice: null,
    bookmakerQuoteCount: 1,
    bookmakerQuotes: [],
    medianBookmakerPriceDecimal: 5,
    medianBookmakerImpliedProbability: .2,
    bestBookmakerPriceDecimal: 5,
    bestBookmakerPriceFractional: "4/1",
    bestBookmakerName: null,
    priceSource: "sporting_life_imported_racecard",
    priceCapturedAt: `${raceDate}T10:00:00.000Z`,
    minutesBeforeScheduledOff: 180,
    capturedDecimalOdds: 5,
    capturedMarketProbability: .2,
    edgePercentagePoints: 5,
    edgeBand: ">2-5pp",
    priceSnapshotScheduleVersion: FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
    earlyPriceSnapshot: null,
    t180PriceSnapshot: null,
    t60PriceSnapshot: null,
    marketFavouriteRunnerIds: [],
    marketFavouriteHorseNames: [],
    agreesWithMarketFavourite: null,
    leaderIsMarketFavourite: null,
    tissueRunnerId: `${input.raceId}-tissue`,
    tissueHorseName: "Tissue",
    tissueProbability: .4,
    tissueAgreesWithTpr: false,
    tissueCapturedPrice: null,
    tissueCapturedDecimalOdds: input.tissueCapturedDecimalOdds,
    tissueMarketProbability: input.tissueCapturedDecimalOdds === null ? null : 1 / input.tissueCapturedDecimalOdds,
    tissueEdgePercentagePoints: input.tissueEdgePercentagePoints,
    tissuePriceCapturedAt: input.tissueCapturedDecimalOdds === null ? null : `${raceDate}T10:00:00.000Z`,
    tissueForecastPrice: null,
    tissueForecastDecimalPrice: null,
    tissueBookmakerQuoteCount: input.tissueCapturedDecimalOdds === null ? 0 : 1,
    tissueBookmakerQuotes: [],
    tissueMedianBookmakerPriceDecimal: input.tissueCapturedDecimalOdds,
    tissueMedianBookmakerImpliedProbability: input.tissueCapturedDecimalOdds === null ? null : 1 / input.tissueCapturedDecimalOdds,
    tissueBestBookmakerPriceDecimal: input.tissueCapturedDecimalOdds,
    tissueBestBookmakerPriceFractional: null,
    tissueBestBookmakerName: null,
    tissueEarlyPriceSnapshot: null,
    tissueT180PriceSnapshot: null,
    tissueT60PriceSnapshot: null,
    winnerRunnerIds: settled ? input.winnerRunnerIds ?? [] : [],
    leaderResultStatus: settled ? "finished" : null,
    leaderFinishingPosition: settled ? 2 : null,
    leaderWon: settled ? false : null,
    finalSp: settled ? 5 : null,
    grossReturn: settled ? 0 : null,
    profitLoss: settled ? -1 : null,
    capturedPriceGrossReturn: settled ? 0 : null,
    capturedPriceProfitLoss: settled ? -1 : null,
    medianMarketPriceGrossReturn: settled ? 0 : null,
    medianMarketPriceProfitLoss: settled ? -1 : null,
    bestBookmakerPriceGrossReturn: settled ? 0 : null,
    bestBookmakerPriceProfitLoss: settled ? -1 : null,
    settledAt: settled ? `${raceDate}T14:00:00.000Z` : null,
  };
}

function jumpTrackerData(races: ReturnType<typeof trackerRace>[]): JumpTissueForwardData {
  return { version: JUMP_TISSUE_FORWARD_VERSION, modelVersion: JUMP_TISSUE_VERSION, featureSchemaVersion: JUMP_TISSUE_SCHEMA, implementedAt: JUMP_TISSUE_IMPLEMENTED_AT, races } as unknown as JumpTissueForwardData;
}

function awTrackerData(races: ReturnType<typeof trackerRace>[]): AwTissueForwardData {
  return { version: AW_TISSUE_FORWARD_VERSION, modelVersion: AW_TISSUE_VERSION, featureSchemaVersion: AW_TISSUE_SCHEMA, implementedAt: AW_TISSUE_IMPLEMENTED_AT, races } as unknown as AwTissueForwardData;
}

function trackerRace(input: {
  raceId: string;
  raceDate?: string;
  edge: number;
  price: number;
  won: boolean | null;
  profitLoss: number | null;
  settled?: boolean;
}) {
  const settled = input.settled ?? true;
  const raceDate = input.raceDate ?? "2026-10-03";
  return {
    raceId: input.raceId,
    raceDate,
    scheduledTime: "13:00",
    scheduledOffAt: `${raceDate}T13:00:00.000Z`,
    currentOffAt: `${raceDate}T13:00:00.000Z`,
    course: "Test",
    raceName: null,
    recordedAt: `${raceDate}T10:00:00.000Z`,
    recordedPreRace: true,
    predictedRunnerCount: 1,
    activeRunnerCount: 1,
    predictionCoverage: 1,
    top1: `${input.raceId}-leader`,
    top2: [`${input.raceId}-leader`],
    top3: [`${input.raceId}-leader`],
    prices: {
      early: {
        decimalPrice: input.price,
        impliedProbability: 1 / input.price,
        capturedAt: `${raceDate}T10:00:00.000Z`,
        minutesBeforeScheduledOff: 180,
        ratingProbability: .4,
        ratingEdgePercentagePoints: input.edge,
        marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
        forecastPrice: null,
        forecastDecimalPrice: null,
        bookmakerQuoteCount: 1,
        bookmakerQuotes: [],
        bestBookmakerPriceDecimal: input.price,
        bestBookmakerPriceFractional: null,
        bestBookmakerName: null,
      },
      t180: null,
      t60: null,
    },
    runners: [{
      runnerId: `${input.raceId}-leader`,
      horseId: `${input.raceId}-horse`,
      horseName: "Tracker Leader",
      probability: .4,
      rank: 1,
      outcome: settled ? {
        finishingPosition: input.won ? 1 : 2,
        resultStatus: "finished",
        won: input.won,
        finalSp: input.price,
        deadHeatDivisor: 1,
        finalSpProfitLoss: input.profitLoss,
      } : null,
    }],
    winners: input.won ? [`${input.raceId}-leader`] : [],
    settledAt: settled ? `${raceDate}T14:00:00.000Z` : null,
    excludedReason: null,
    selectedPriceProfitLoss: { early: input.profitLoss, t180: null, t60: null, bestEarly: input.profitLoss, finalSp: input.profitLoss },
    subtype: "Hurdle",
    jprALeader: null,
    jprBLeader: null,
    awDLeader: null,
  };
}

function turfData(races: TissueForwardRace[]): TissueForwardData {
  return {
    version: TISSUE_V2_CONFIG.forwardVersion,
    tissueModelVersion: TISSUE_V2_CONFIG.modelVersion,
    forwardStart: TISSUE_V2_CONFIG.forwardStart,
    forwardStartAt: TISSUE_V2_CONFIG.forwardStartAt,
    races,
  };
}

function turfRace(raceId: string, raceTime: string, course: string, horseName: string, probability: number): TissueForwardRace {
  return {
    raceDate: "2026-10-03",
    course,
    raceTime,
    raceId,
    sourceId: null,
    raceName: null,
    tissueModelVersion: TISSUE_V2_CONFIG.modelVersion,
    tissueModelChecksum: "checksum",
    recordedAt: "2026-10-03T09:00:00.000Z",
    recordedPreRace: true,
    runners: [{
      runnerId: `${raceId}-runner`,
      horseId: `${raceId}-horse`,
      horseName,
      probability,
      fairDecimalOdds: 1 / probability,
      tissueRank: 1,
      commentFeatures: [],
      finishingPosition: null,
      finalSp: null,
      marketImpliedProbability: null,
      marketRank: null,
    }],
    winners: [],
    settledAt: null,
  };
}

function jumpData(races: JumpTissueRace[]): JumpTissueForwardData {
  return { version: JUMP_TISSUE_FORWARD_VERSION, modelVersion: JUMP_TISSUE_VERSION, featureSchemaVersion: JUMP_TISSUE_SCHEMA, implementedAt: JUMP_TISSUE_IMPLEMENTED_AT, races };
}

function jumpRace(raceId: string, scheduledTime: string, course: string, horseName: string, probability: number): JumpTissueRace {
  return tissueRace({
    raceId,
    scheduledTime,
    course,
    horseName,
    probability,
    implementedAt: JUMP_TISSUE_IMPLEMENTED_AT,
    modelVersion: JUMP_TISSUE_VERSION,
    featureSchemaVersion: JUMP_TISSUE_SCHEMA,
    versionedFamily: "jump",
  }) as unknown as JumpTissueRace;
}

function awData(races: AwTissueRace[]): AwTissueForwardData {
  return { version: AW_TISSUE_FORWARD_VERSION, modelVersion: AW_TISSUE_VERSION, featureSchemaVersion: AW_TISSUE_SCHEMA, implementedAt: AW_TISSUE_IMPLEMENTED_AT, races };
}

function awRace(raceId: string, scheduledTime: string, course: string, horseName: string, probability: number): AwTissueRace {
  return tissueRace({
    raceId,
    scheduledTime,
    course,
    horseName,
    probability,
    implementedAt: AW_TISSUE_IMPLEMENTED_AT,
    modelVersion: AW_TISSUE_VERSION,
    featureSchemaVersion: AW_TISSUE_SCHEMA,
    versionedFamily: "aw",
  }) as unknown as AwTissueRace;
}

function tissueRace(input: {
  raceId: string;
  scheduledTime: string;
  course: string;
  horseName: string;
  probability: number;
  implementedAt: string;
  modelVersion: string;
  featureSchemaVersion: string;
  versionedFamily: "jump" | "aw";
}) {
  return {
    raceId: input.raceId,
    sourceId: null,
    raceDate: "2026-10-03",
    course: input.course,
    raceName: null,
    scheduledTime: input.scheduledTime,
    scheduledOffAt: `2026-10-03T${input.scheduledTime}:00.000Z`,
    currentOffAt: `2026-10-03T${input.scheduledTime}:00.000Z`,
    subtype: input.versionedFamily === "jump" ? "Hurdle" : undefined,
    nhFlat: false,
    fieldSize: 2,
    recordedAt: input.versionedFamily === "jump" ? "2026-10-03T14:00:00.000Z" : "2026-10-03T09:00:00.000Z",
    recordedPreRace: true,
    modelVersion: input.modelVersion,
    featureSchemaVersion: input.featureSchemaVersion,
    modelHash: "checksum",
    activeRunnerCount: 2,
    predictedRunnerCount: 2,
    predictionCoverage: 1,
    runners: [{
      runnerId: `${input.raceId}-runner`,
      horseId: `${input.raceId}-horse`,
      horseName: input.horseName,
      probability: input.probability,
      rank: 1,
      predictionAvailable: true,
      unavailableReason: null,
      outcome: null,
    }],
    top1: `${input.raceId}-runner`,
    top2: [`${input.raceId}-runner`],
    top3: [`${input.raceId}-runner`],
    jprALeader: null,
    jprBLeader: null,
    awDLeader: null,
    awALeader: null,
    awDCoverage: { ratingCoverageStatus: "eligible" },
    winners: [],
    settledAt: null,
    excludedReason: null,
    marketPriceBasisVersion: "median_bookmaker_v1",
    priceSnapshotScheduleVersion: "early_t180_t60_v1",
    prices: { early: tissueRacePriceSnapshot(input), t180: null, t60: null },
    selectedPriceProfitLoss: { early: null, t180: null, t60: null, bestEarly: null, finalSp: null },
  };
}

function tissueRacePriceSnapshot(input: {
  raceId: string;
  probability: number;
  versionedFamily: "jump" | "aw";
}) {
  const decimalPrice = input.raceId.includes("missing")
    ? null
    : input.raceId.includes("negative")
      ? 5
      : input.versionedFamily === "jump" ? 4 : 4.5;
  if (decimalPrice === null) return null;
  return {
    decimalPrice,
    impliedProbability: 1 / decimalPrice,
    capturedAt: input.versionedFamily === "jump" ? "2026-10-03T14:00:00.000Z" : "2026-10-03T09:00:00.000Z",
    minutesBeforeScheduledOff: 30,
    ratingProbability: input.probability,
    ratingEdgePercentagePoints: (input.probability - 1 / decimalPrice) * 100,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
    bookmakerQuoteCount: input.versionedFamily === "jump" ? 4 : 2,
  };
}

function price(
  raceId: string,
  runnerId: string,
  marketPrice: string | null,
  marketDecimalOdds: number | null,
  bookmakerQuoteCount: number,
  displayRaceTime: string,
  forecastPrice: string | null = null,
  forecastDecimalOdds: number | null = null,
): SportingLifeCurrentPrice {
  return { raceId, runnerId, marketPrice, marketDecimalOdds, bookmakerQuoteCount, forecastPrice, forecastDecimalOdds, displayRaceTime };
}
