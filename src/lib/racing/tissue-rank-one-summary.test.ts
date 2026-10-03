import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderDailyPositiveTissueRankOneSummary } from "./forward-value-summary";
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
    currentRaceIds: new Set(["turf-late", "turf-early", "turf-zero", "turf-forecast"]),
  });

  assert.match(output, /Today's positive-edge Tissue rank-1 horses/);
  assert.match(output, /TURF\n13:50 Ascot - Fluorescence\nTissue 30\.0% \| Market 4\/1 \| Edge \+10\.0pp \| Quotes 3 \| LARGE\n\n14:00 Ascot - By The Book/);
  assert.match(output, /JUMP\n14:30 Gowran Park - Jump Horse\nTissue 26\.0% \| Market 3\/1 \| Edge \+1\.0pp \| Quotes 4/);
  assert.match(output, /ALL WEATHER\n15:16 Wolverhampton - AW Horse\nTissue 40\.0% \| Market 7\/2 \| Edge \+17\.8pp \| Quotes 2 \| LARGE/);
  assert.doesNotMatch(output, /Zero Edge|Jump Negative|AW Missing|Forecast Only/);
  assert.match(output, /Daily positive-edge rank-1 summary:\nTurf 2 \| Jump 1 \| AW 1 \| Total 4/);
  assert.match(output, /Large edges >=10pp: 2/);
  assert.match(output, /Monitoring only; not a betting recommendation\./);
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
  assert.match(output, /Turf 0 \| Jump 0 \| AW 0 \| Total 0/);
});

test("value scripts keep concise today and long-form summary paths", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.equal(packageJson.scripts["value:today"], "bun run scripts/report-forward-value.ts today");
  assert.equal(packageJson.scripts["value:summary"], "bun run scripts/report-forward-value.ts summary");

  const source = readFileSync("scripts/report-forward-value.ts", "utf8");
  assert.match(source, /async function today\(date: string\) \{\s*console\.log\(\(await loadDailyPositiveTissueRankOneReport\(date\)\)\.output\);\s*\}/);
  assert.match(source, /loadDailyPositiveTissueRankOneReport\(today\)/);
  assert.match(source, /# Forward Value Framework - Phase 2/);
  assert.match(source, /printEdgeBuckets\(cleanSettled\)/);
  assert.match(source, /printGapEdgeCrossTab\(cleanSettled, familyCalibration\)/);
  assert.match(source, /printFavouriteComparison\(cleanSettled\)/);
});

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
    recordedAt: "2026-10-03T09:00:00.000Z",
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
    prices: { early: null, t180: null, t60: null },
    selectedPriceProfitLoss: { early: null, t180: null, t60: null, bestEarly: null, finalSp: null },
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
