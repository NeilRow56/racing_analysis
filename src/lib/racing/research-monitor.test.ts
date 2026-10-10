import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyAwTissueForward, type AwTissueRace } from "./aw-tissue-forward";
import { emptyJumpTissueForward, type JumpTissueRace } from "./jump-tissue-forward";
import { emptyJumpG4ForwardData, type JumpG4Observation } from "./jump-g4-forward";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION, type ForwardValuePriceSnapshot } from "./forward-value";
import { JUMP_TISSUE_SCHEMA, JUMP_TISSUE_VERSION } from "./jump-tissue-model";
import { buildResearchDashboard, mergeResearchSignals, priceMovement, RESEARCH_SIGNALS, RESEARCH_STATUS, type DailyResearchHorse } from "./research-monitor";
import { currentPositiveJumpTissueRankOneEdges } from "./jump-tissue-forward";
import type { SportingLifeCurrentPrice } from "./todays-racing";
import type { TissueForwardData, TissueForwardRace } from "./tissue-forward";
import { emptyTodaysRatingWeightForward, type TodaysRatingWeightObservation } from "./todays-rating-weight-forward";
import { emptyModelDisagreementForwardData, type DisagreementMarketSnapshot, type ModelDisagreementObservation } from "./model-disagreement-forward";

const date = "2026-10-09";
function inputs() {
  return { date, prices: [] as SportingLifeCurrentPrice[], turf: { version: "tissue_forward_v2", tissueModelVersion: "tissue_model_v2", forwardStart: date, races: [] } as TissueForwardData,
    jump: emptyJumpTissueForward(), aw: emptyAwTissueForward(), g4: emptyJumpG4ForwardData(), ratings: [] };
}
function price(runnerId = "runner", odds: number | null = 8): SportingLifeCurrentPrice {
  return { raceId: "race", runnerId, marketPrice: odds === null ? null : String(odds), marketDecimalOdds: odds, bookmakerQuoteCount: odds === null ? 0 : 2, forecastPrice: "99/1", forecastDecimalOdds: 100, displayRaceTime: "14:00" };
}
function jumpRace(): JumpTissueRace {
  const probability = .2;
  return { raceId: "race", sourceId: null, raceName: "Test Hurdle", subtype: "Hurdle", nhFlat: false, fieldSize: 2,
    modelVersion: JUMP_TISSUE_VERSION, featureSchemaVersion: JUMP_TISSUE_SCHEMA, modelHash: "frozen",
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, priceSnapshotScheduleVersion: FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
    top2: ["runner"], top3: ["runner"], jprALeader: null, jprBLeader: null,
    raceDate: date, course: "Teston", scheduledTime: "13:00", scheduledOffAt: `${date}T13:00:00Z`, currentOffAt: `${date}T13:00:00Z`, recordedAt: `${date}T09:00:00Z`, recordedPreRace: true,
    excludedReason: null, predictedRunnerCount: 2, activeRunnerCount: 2, predictionCoverage: 1, settledAt: null, top1: "runner", winners: [],
    runners: [{ runnerId: "runner", horseId: "horse", horseName: "Overlap Horse", rank: 1, probability, outcome: null,
      predictionAvailable: true, unavailableReason: null, rawInputs: [], modelInputs: [], modelVersion: JUMP_TISSUE_VERSION, featureSchemaVersion: JUMP_TISSUE_SCHEMA,
      priorJumpStarts: 2, historyBucket: "two", zeroPriorJumpStarts: false, onePriorJumpStart: false, twoPriorJumpStarts: true, threePlusPriorJumpStarts: false,
      commentProvenance: { representationVersion: JUMP_TISSUE_SCHEMA, sourceObservationCutoff: null, priorCommentCount: 0, activeCommentFeatures: [], chronologySafe: true, targetRacePostResultCommentExcluded: true },
    }],
    prices: { early: snapshot(8, probability), t180: null, t60: null }, selectedPriceProfitLoss: { early: null, t180: null, t60: null, bestEarly: null, finalSp: null },
  };
}
function g4(): JumpG4Observation {
  return { raceId: "race", runnerId: "runner", horseId: "horse", horseName: "Overlap Horse", course: "Teston", raceDate: date, scheduledTime: "13:00", scheduledOff: `${date}T13:00:00Z`, recordedAt: `${date}T09:00:00Z`, recordedPreRace: true, settledAt: null, outcome: null,
    components: { averageL3JumpSpeedRank: 2, averageL3JumpSpeed: 110, latestJumpSpeed: 118, previousJumpSpeed: 109, latestMinusPrevious: 9, previousClass: 4, currentClass: 5, classDropAmount: 1 },
    context: { officialRatingRank: 4, jprARank: 2, jumpTissueRank: 1 },
    market: { medianBookmakerDecimal: null, impliedProbability: null },
  } as JumpG4Observation;
}

test("merges actual Jump Tissue and G4 signals into one horse with both reasons", () => {
  const input = inputs(); input.prices = [price()]; input.jump.races = [jumpRace()]; input.g4.observations = [g4()];
  const dashboard = buildResearchDashboard(input);
  assert.equal(dashboard.horses.length, 1);
  assert.deepEqual(dashboard.horses[0].signals.map((signal) => signal.kind), ["jump_tissue", "jump_g4"]);
  assert.match(dashboard.horses[0].signals[0].reason, /Tissue 20.0% · market 12.5% · \+7.5pp/);
  assert.match(dashboard.horses[0].signals[0].context, /qualified at 8\.00 EARLY/);
  assert.match(dashboard.horses[0].signals[1].reason, /Avg L3 #2 · class drop 4→5 · latest speed 118 > 109/);
  assert.equal(dashboard.horses[0].price, 8);
  assert.equal(dashboard.horses[0].priceSource, "imported_card");
});

test("overlap preserves the displayed price source and the separate G4 captured median", () => {
  const input = inputs(); input.prices = [price()]; input.jump.races = [jumpRace()];
  const observation = g4(); observation.market.medianBookmakerDecimal = 10;
  input.g4.observations = [observation];
  const horse = buildResearchDashboard(input).horses[0];
  assert.equal(horse.price, 8);
  assert.equal(horse.priceSource, "imported_card");
  assert.match(horse.signals.find((signal) => signal.kind === "jump_g4")!.context, /Captured median 10.00/);
  input.jump.races = [];
  const shadow = buildResearchDashboard(input).horses[0];
  assert.equal(shadow.price, 10);
  assert.equal(shadow.priceSource, "g4_capture");
});

test("G4 stays visible without bookmaker price and forecasts never qualify Tissue value", () => {
  const input = inputs(); input.prices = [price("runner", null)]; input.jump.races = [{ ...jumpRace(), prices: { early: null, t180: null, t60: null } }]; input.g4.observations = [g4()];
  const dashboard = buildResearchDashboard(input);
  assert.equal(dashboard.horses.length, 1);
  assert.deepEqual(dashboard.horses[0].signals.map((signal) => signal.kind), ["jump_g4"]);
  assert.equal(dashboard.horses[0].price, null);
  assert.equal(dashboard.horses[0].priceSource, null);
});

test("Tissue rank-one positive-edge qualification matches the existing helper at boundaries", () => {
  for (const odds of [2, 5, 5.01, 8, null]) {
    const input = inputs(); input.prices = [price("runner", odds)]; input.jump.races = [{ ...jumpRace(), prices: { early: odds === null ? null : snapshot(odds, .2), t180: null, t60: null } }];
    assert.equal(buildResearchDashboard(input).horses.length, currentPositiveJumpTissueRankOneEdges(input.jump.races, input.prices).selections.length);
  }
  const input = inputs(); input.prices = [price()]; input.jump.races = [{ ...jumpRace(), recordedPreRace: false }];
  assert.equal(buildResearchDashboard(input).horses.length, 0);
});

test("Turf and AW use their existing rank-one positive-edge semantics", () => {
  const input = inputs(); input.prices = [price()];
  input.turf.races = [turfRace()];
  assert.equal(buildResearchDashboard(input).horses[0].signals[0].kind, "turf_tissue");
  input.turf.races = [];
  input.aw.races = [jumpRace() as unknown as AwTissueRace];
  assert.equal(buildResearchDashboard(input).horses[0].signals[0].kind, "aw_tissue");
  input.aw.races[0].top1 = "other";
  assert.equal(buildResearchDashboard(input).horses.length, 0);
});

test("weight shadow merges with Turf Tissue, preserves qualifying price and reports separate market metrics", () => {
  const input = inputs(); input.prices = [price()]; input.turf.races = [turfRace()];
  const data = emptyTodaysRatingWeightForward();
  const row: TodaysRatingWeightObservation = { raceId: "race", sourceId: null, runnerId: "runner", horseId: "horse", horseName: "Turf Horse",
    raceDate: date, course: "Teston", scheduledOff: `${date}T13:00:00Z`, scheduledTime: "14:00", recordedAt: `${date}T12:00:00Z`,
    recordedPreRace: true, ratingVersion: "todays_rating_v1", todaysRating: 102.4, latestSpeed: 94.4, bestL3Speed: 98, avgL3Speed: 93,
    tpr: null, todayWeight: 125, priorRun: { runnerId: "prior", raceDateTime: "2026-08-30T12:00:00Z", weightCarriedLbs: 133, speed: 94.4 },
    signedWeightChange: -8, weightBand: "8+ lb lighter", todaysRatingRank: 1, latestSpeedRank: 2, bestL3Rank: 2, tprRank: null,
    latestSpeedLeaders: [], market: { qualifying: { capturedAt: `${date}T12:00:00Z`, priceCapturedAt: `${date}T12:00:00Z`,
      source: "sporting_life_stored_bookmaker_median_at_capture_v1", marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
      medianDecimal: 10, impliedProbability: .1, bookmakerQuoteCount: 2, bookmakerQuotes: [] }, later: [], finalStoredPreRace: null },
    outcome: null, settledAt: null };
  data.observations = [row];
  const dashboard = buildResearchDashboard({ ...input, todaysRatingWeight: data });
  assert.equal(dashboard.horses.length, 1);
  assert.deepEqual(dashboard.horses[0].signals.map((signal) => signal.kind), ["turf_tissue", "todays_rating_weight"]);
  assert.equal(dashboard.horses[0].price, 8);
  assert.equal(RESEARCH_SIGNALS.todays_rating_weight.category, "SHADOW");
  assert.match(dashboard.horses[0].signals[1].reason, /Today's Rating #1 · 8 lb lighter/);
  assert.match(dashboard.horses[0].signals[1].context, /Qualifying median 10.00/);
  data.observations = [{ ...row, outcome: { status: "settled", resultStatus: "finished", finishingPosition: 1,
    won: true, deadHeatDivisor: 1, finalSp: 6, qualifyingPriceProfitLoss: 9, finalSpProfitLoss: 5 }, settledAt: `${date}T13:05:00Z` }];
  const monitor = buildResearchDashboard({ ...input, todaysRatingWeight: data }).monitors.find((monitor) => monitor.name === RESEARCH_SIGNALS.todays_rating_weight.name)!;
  assert.equal(monitor.ae, 10); assert.equal(monitor.roi, 9); assert.equal(monitor.roiBasis, "qualifying_median");
  assert.equal(buildResearchDashboard({ ...input, todaysRatingWeight: data }).monitors[0].tracked, 1);
});

function turfRace(): TissueForwardRace {
  return { raceId: "race", sourceId: null, raceDate: date, course: "Teston", raceTime: "14:00", raceName: null, tissueModelVersion: "tissue_model_v2", tissueModelChecksum: "frozen", recordedAt: `${date}T09:00:00Z`, recordedPreRace: true, settledAt: null, winners: [],
    runners: [{ runnerId: "runner", horseId: "horse", horseName: "Turf Horse", probability: .2, tissueRank: 1, fairDecimalOdds: 5, commentFeatures: [], finishingPosition: null, finalSp: null, marketImpliedProbability: null, marketRank: null }],
  };
}

function snapshot(decimalPrice: number, probability: number): ForwardValuePriceSnapshot {
  return {
    price: null,
    decimalPrice,
    impliedProbability: 1 / decimalPrice,
    capturedAt: `${date}T09:00:00Z`,
    minutesBeforeScheduledOff: 240,
    ratingProbability: probability,
    ratingEdgePercentagePoints: (probability - 1 / decimalPrice) * 100,
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
    bookmakerQuoteCount: 2,
    bookmakerQuotes: [],
    medianBookmakerPriceDecimal: decimalPrice,
    medianBookmakerImpliedProbability: 1 / decimalPrice,
    bestBookmakerPriceDecimal: decimalPrice,
    bestBookmakerPriceFractional: null,
    bestBookmakerName: null,
    forecastPrice: "99/1",
    forecastDecimalPrice: 100,
  };
}

test("Turf headline outcomes use the tracker's horse-name winner keys", () => {
  const input = inputs(); input.turf.races = [{ ...turfRace(), winners: ["Turf Horse"], settledAt: `${date}T14:00:00Z` }];
  const monitor = buildResearchDashboard(input).monitors[0];
  assert.equal(monitor.winners, 1);
  assert.equal(monitor.strike, 1);
  assert.equal(monitor.ae, 5);
  assert.equal(monitor.roi, null);
});

test("merging is chronological, deduplicates streams and preserves separate races", () => {
  const row: DailyResearchHorse = { raceId: "late", runnerId: "runner", horseId: "horse", horseName: "Horse", time: "17:00", sortTime: "", course: "Teston", price: null, priceSource: null, signals: [{ kind: "jump_g4", reason: "Reason", context: "", movement: null }] };
  const early = { ...row, raceId: "early", time: "09:05" };
  const merged = mergeResearchSignals([row, early, row]);
  assert.deepEqual(merged.map((horse) => horse.raceId), ["early", "late"]);
  assert.equal(merged[1].signals.length, 1);
});

test("empty states distinguish no imported racecards from no signals", () => {
  assert.equal(buildResearchDashboard(inputs()).emptyMessage, `No racecards imported for ${date}.`);
  const input = inputs(); input.prices = [price()];
  assert.equal(buildResearchDashboard(input).emptyMessage, "No research signals today.");
});

test("category/status mappings include the separate weight shadow stream", () => {
  assert.deepEqual(Object.values(RESEARCH_SIGNALS).map((signal) => signal.category), ["VALUE", "VALUE", "VALUE", "SHADOW", "SHADOW", "DISAGREEMENT"]);
  assert.equal(RESEARCH_STATUS.length, 9);
  assert.deepEqual(buildResearchDashboard(inputs()).monitors.map((monitor) => monitor.status), ["FROZEN", "MONITORING", "MONITORING", "SHADOW", "SHADOW"]);
});

test("price movement uses stored median snapshots without a forecast fallback", () => {
  const snapshot = (decimalPrice: number) => ({ decimalPrice, marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, bookmakerQuoteCount: 2 }) as ForwardValuePriceSnapshot;
  assert.equal(priceMovement({ early: snapshot(8), t60: snapshot(6.5) }), "Early 8.00 → T-60 6.50");
  assert.equal(priceMovement({ early: snapshot(8) }), "No later snapshot");
  assert.equal(priceMovement({ early: { ...snapshot(100), marketPriceBasisVersion: undefined }, t60: snapshot(6.5) }), "No later snapshot");
});

test("monitor returns use stored settlement and exclude void G4 observations", () => {
  const input = inputs(); const observation = g4();
  observation.settledAt = `${date}T14:00:00Z`;
  observation.outcome = { won: true, profitLoss: 3, deadHeatDivisor: 2, finalSp: 9, finishingPosition: 1, resultStatus: "finished" };
  observation.market.impliedProbability = .125;
  input.g4.observations = [observation, { ...observation, runnerId: "void", outcome: { ...observation.outcome, won: null, profitLoss: 0 } }];
  const monitor = buildResearchDashboard(input).monitors[3];
  assert.equal(monitor.settled, 1);
  assert.equal(monitor.ae, 8);
  assert.equal(monitor.roi, 3);
  assert.equal(monitor.roiBasis, "final_sp");
  assert.equal(monitor.tracked, 2);
});

test("model disagreement monitor renders pending null outcomes without settled returns", () => {
  const input = { ...inputs(), prices: [price()], modelDisagreement: disagreementData([disagreementRow({ outcome: null, settledAt: null })]), includeModelDisagreementInDailySummary: true };
  const dashboard = buildResearchDashboard(input);
  const monitor = disagreementMonitor(dashboard)!;
  assert.equal(dashboard.horses.length, 1);
  assert.equal(dashboard.horses[0].signals[0].kind, "model_disagreement");
  assert.equal(monitor.tracked, 1);
  assert.equal(monitor.settled, 0);
  assert.equal(monitor.winners, 0);
  assert.equal(monitor.strike, null);
  assert.equal(monitor.ae, null);
  assert.equal(monitor.roi, null);
  assert.equal(monitor.pricedSettled, 0);
});

test("model agreement control rows stay tracked but do not render on the primary research monitor", () => {
  const input = { ...inputs(), prices: [price()], modelDisagreement: disagreementData([disagreementRowWithProbabilities(.116, .118)]), includeModelDisagreementInDailySummary: true };
  const dashboard = buildResearchDashboard(input);
  const monitor = disagreementMonitor(dashboard)!;
  assert.equal(dashboard.horses.length, 0);
  assert.equal(monitor.tracked, 1);
  assert.equal(monitor.settled, 0);
});

test("non-material model difference does not suppress an independent Tissue value signal", () => {
  const input = { ...inputs(), prices: [price()] };
  input.jump.races = [jumpRace()];
  const dashboard = buildResearchDashboard({ ...input, modelDisagreement: disagreementData([disagreementRowWithProbabilities(.182, .231)]), includeModelDisagreementInDailySummary: true });
  assert.equal(dashboard.horses.length, 1);
  assert.deepEqual(dashboard.horses[0].signals.map((signal) => signal.kind), ["jump_tissue"]);
  assert.doesNotMatch(dashboard.horses[0].signals.map((signal) => signal.reason).join(" "), /MODEL|MARKET FAVOURS/);
});

test("model disagreement monitor counts pending as tracked but settled rows drive performance", () => {
  const input = { ...inputs(), prices: [price()], modelDisagreement: disagreementData([
    disagreementRow({ runnerId: "pending", horseName: "Pending Horse", outcome: null, settledAt: null }),
    disagreementRow({ runnerId: "settled", horseName: "Settled Horse", outcome: settledDisagreementOutcome({ won: true, profitLoss: 4 }), settledAt: `${date}T13:10:00Z` }),
  ]), includeModelDisagreementInDailySummary: true };
  const monitor = disagreementMonitor(buildResearchDashboard(input))!;
  assert.equal(monitor.tracked, 2);
  assert.equal(monitor.settled, 1);
  assert.equal(monitor.winners, 1);
  assert.equal(monitor.strike, 1);
  assert.equal(monitor.ae, 5);
  assert.equal(monitor.roi, 4);
  assert.equal(monitor.pricedSettled, 1);
});

test("model disagreement monitor includes valid qualifying-price profit loss", () => {
  const input = { ...inputs(), modelDisagreement: disagreementData([
    disagreementRow({ outcome: settledDisagreementOutcome({ won: false, profitLoss: -1 }), settledAt: `${date}T13:10:00Z` }),
  ]), includeModelDisagreementInDailySummary: true };
  const monitor = disagreementMonitor(buildResearchDashboard(input))!;
  assert.equal(monitor.settled, 1);
  assert.equal(monitor.winners, 0);
  assert.equal(monitor.roi, -1);
  assert.equal(monitor.pricedSettled, 1);
});

test("model disagreement monitor excludes settled rows without valid qualifying prices", () => {
  const input = { ...inputs(), modelDisagreement: disagreementData([
    disagreementRow({ firstQualifyingSnapshot: null, outcome: settledDisagreementOutcome({ won: false, profitLoss: null }), settledAt: `${date}T13:10:00Z` }),
  ]), includeModelDisagreementInDailySummary: true };
  const monitor = disagreementMonitor(buildResearchDashboard(input))!;
  assert.equal(monitor.tracked, 1);
  assert.equal(monitor.settled, 1);
  assert.equal(monitor.winners, 0);
  assert.equal(monitor.strike, 0);
  assert.equal(monitor.ae, null);
  assert.equal(monitor.roi, null);
  assert.equal(monitor.pricedSettled, 0);
});

test("model disagreement monitor renders safely with zero observations", () => {
  const input = { ...inputs(), modelDisagreement: disagreementData([]), includeModelDisagreementInDailySummary: true };
  const monitor = disagreementMonitor(buildResearchDashboard(input))!;
  assert.equal(monitor.tracked, 0);
  assert.equal(monitor.settled, 0);
  assert.equal(monitor.winners, 0);
  assert.equal(monitor.strike, null);
  assert.equal(monitor.ae, null);
  assert.equal(monitor.roi, null);
  assert.equal(monitor.pricedSettled, 0);
});

test("model disagreement stays out of the normal daily summary unless explicitly requested", () => {
  const input = { ...inputs(), prices: [price()], modelDisagreement: disagreementData([disagreementRow({ outcome: null, settledAt: null })]) };
  const dashboard = buildResearchDashboard(input);
  assert.equal(dashboard.horses.length, 0);
  assert.equal(disagreementMonitor(dashboard), undefined);
  const explicit = buildResearchDashboard({ ...input, includeModelDisagreementInDailySummary: true });
  assert.equal(explicit.horses[0]!.signals[0]!.kind, "model_disagreement");
  assert.equal(disagreementMonitor(explicit)!.tracked, 1);
});

function disagreementMonitor(dashboard: ReturnType<typeof buildResearchDashboard>) {
  return dashboard.monitors.find((monitor) => monitor.name === RESEARCH_SIGNALS.model_disagreement.name);
}

function disagreementData(observations: ModelDisagreementObservation[]) {
  return { ...emptyModelDisagreementForwardData(), observations };
}

type DisagreementRowOverrides = Partial<ModelDisagreementObservation> & { firstQualifyingSnapshot?: DisagreementMarketSnapshot | null };

function disagreementRow(overrides: DisagreementRowOverrides = {}): ModelDisagreementObservation {
  const { firstQualifyingSnapshot: snapshotOverride, ...rowOverrides } = overrides;
  const firstQualifyingSnapshot = "firstQualifyingSnapshot" in overrides ? snapshotOverride ?? null : disagreementSnapshot(5);
  return {
    raceDate: date,
    raceId: overrides.raceId ?? `race-${overrides.runnerId ?? "runner"}`,
    sourceId: null,
    scheduledOff: `${date}T13:00:00Z`,
    scheduledTime: "13:00",
    course: "Teston",
    raceName: "Test Chase",
    family: "JUMP",
    runnerId: "runner",
    horseId: "horse",
    horseName: "Disagreement Horse",
    recordedAt: `${date}T09:00:00Z`,
    recordedPreRace: true,
    frozen: {
      label: "MODEL_HIGH_MARKET_LOW",
      labelledAt: `${date}T09:00:00Z`,
      modelProbability: .3,
      modelRank: 1,
      marketImpliedProbability: firstQualifyingSnapshot?.impliedProbability ?? null,
      edgePercentagePoints: firstQualifyingSnapshot ? (.3 - firstQualifyingSnapshot.impliedProbability) * 100 : null,
      firstQualifyingSnapshot,
      signalRanks: { tissueRank: 1, tissueProbability: .3, primaryRatingRank: 4, avgL3SpeedRank: 2, latestSpeedRank: 3,
        bestL3Rank: 2, officialRatingRank: 5, jumpG4Qualified: false, todaysRating: 100, todaysRatingRank: 2 },
    },
    snapshots: firstQualifyingSnapshot ? { NIGHT_BEFORE: firstQualifyingSnapshot } : {},
    movements: [],
    finalSp: null,
    outcome: null,
    settledAt: null,
    ...rowOverrides,
  };
}

function disagreementRowWithProbabilities(modelProbability: number, marketProbability: number, overrides: DisagreementRowOverrides = {}) {
  const row = disagreementRow({ ...overrides, firstQualifyingSnapshot: disagreementSnapshot(1 / marketProbability) });
  return {
    ...row,
    frozen: {
      ...row.frozen,
      label: Math.abs(modelProbability - marketProbability) * 100 >= 5 && Math.max(modelProbability, marketProbability) / Math.min(modelProbability, marketProbability) >= 1.5
        ? modelProbability > marketProbability ? "MODEL_HIGH_MARKET_LOW" as const : "MARKET_HIGH_MODEL_LOW" as const
        : "MODEL_AGREEMENT" as const,
      modelProbability,
      marketImpliedProbability: marketProbability,
      edgePercentagePoints: (modelProbability - marketProbability) * 100,
      signalRanks: { ...row.frozen.signalRanks, tissueProbability: modelProbability },
    },
    snapshots: { NIGHT_BEFORE: { ...disagreementSnapshot(1 / marketProbability), impliedProbability: marketProbability } },
  };
}

function settledDisagreementOutcome({ won, profitLoss }: { won: boolean; profitLoss: number | null }): ModelDisagreementObservation["outcome"] {
  return { status: "settled", resultStatus: "finished", finishingPosition: won ? 1 : 2, won,
    deadHeatDivisor: 1, finalSp: won ? 4 : 6, qualifyingPriceProfitLoss: profitLoss, finalSpProfitLoss: won ? 3 : -1 };
}

function disagreementSnapshot(decimalPrice: number): DisagreementMarketSnapshot {
  return { capturePoint: "NIGHT_BEFORE", capturedAt: `${date}T09:00:00Z`, medianBookmakerDecimal: decimalPrice, impliedProbability: 1 / decimalPrice,
    bestBookmakerDecimal: decimalPrice, bestBookmakerFractional: null, bestBookmakerName: null, bookmakerQuoteCount: 2, bookmakerQuotes: [],
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION };
}
