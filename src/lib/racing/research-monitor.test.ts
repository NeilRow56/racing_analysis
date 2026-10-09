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

const date = "2026-10-09";
function inputs() {
  return { date, prices: [] as SportingLifeCurrentPrice[], turf: { version: "tissue_forward_v2", tissueModelVersion: "tissue_model_v2", forwardStart: date, races: [] } as TissueForwardData,
    jump: emptyJumpTissueForward(), aw: emptyAwTissueForward(), g4: emptyJumpG4ForwardData(), ratings: [] };
}
function price(runnerId = "runner", odds: number | null = 8): SportingLifeCurrentPrice {
  return { raceId: "race", runnerId, marketPrice: odds === null ? null : String(odds), marketDecimalOdds: odds, bookmakerQuoteCount: odds === null ? 0 : 2, forecastPrice: "99/1", forecastDecimalOdds: 100, displayRaceTime: "14:00" };
}
function jumpRace(): JumpTissueRace {
  return { raceId: "race", sourceId: null, raceName: "Test Hurdle", subtype: "Hurdle", nhFlat: false, fieldSize: 2,
    modelVersion: JUMP_TISSUE_VERSION, featureSchemaVersion: JUMP_TISSUE_SCHEMA, modelHash: "frozen",
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION, priceSnapshotScheduleVersion: FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
    top2: ["runner"], top3: ["runner"], jprALeader: null, jprBLeader: null,
    raceDate: date, course: "Teston", scheduledTime: "13:00", scheduledOffAt: `${date}T13:00:00Z`, currentOffAt: `${date}T13:00:00Z`, recordedAt: `${date}T09:00:00Z`, recordedPreRace: true,
    excludedReason: null, predictedRunnerCount: 2, activeRunnerCount: 2, predictionCoverage: 1, settledAt: null, top1: "runner", winners: [],
    runners: [{ runnerId: "runner", horseId: "horse", horseName: "Overlap Horse", rank: 1, probability: .2, outcome: null,
      predictionAvailable: true, unavailableReason: null, rawInputs: [], modelInputs: [], modelVersion: JUMP_TISSUE_VERSION, featureSchemaVersion: JUMP_TISSUE_SCHEMA,
      priorJumpStarts: 2, historyBucket: "two", zeroPriorJumpStarts: false, onePriorJumpStart: false, twoPriorJumpStarts: true, threePlusPriorJumpStarts: false,
      commentProvenance: { representationVersion: JUMP_TISSUE_SCHEMA, sourceObservationCutoff: null, priorCommentCount: 0, activeCommentFeatures: [], chronologySafe: true, targetRacePostResultCommentExcluded: true },
    }],
    prices: { early: null, t180: null, t60: null }, selectedPriceProfitLoss: { early: null, t180: null, t60: null, bestEarly: null, finalSp: null },
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
  const input = inputs(); input.prices = [price("runner", null)]; input.jump.races = [jumpRace()]; input.g4.observations = [g4()];
  const dashboard = buildResearchDashboard(input);
  assert.equal(dashboard.horses.length, 1);
  assert.deepEqual(dashboard.horses[0].signals.map((signal) => signal.kind), ["jump_g4"]);
  assert.equal(dashboard.horses[0].price, null);
  assert.equal(dashboard.horses[0].priceSource, null);
});

test("Tissue rank-one positive-edge qualification matches the existing helper at boundaries", () => {
  for (const odds of [2, 5, 5.01, 8, null]) {
    const input = inputs(); input.prices = [price("runner", odds)]; input.jump.races = [jumpRace()];
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

function turfRace(): TissueForwardRace {
  return { raceId: "race", sourceId: null, raceDate: date, course: "Teston", raceTime: "14:00", raceName: null, tissueModelVersion: "tissue_model_v2", tissueModelChecksum: "frozen", recordedAt: `${date}T09:00:00Z`, recordedPreRace: true, settledAt: null, winners: [],
    runners: [{ runnerId: "runner", horseId: "horse", horseName: "Turf Horse", probability: .2, tissueRank: 1, fairDecimalOdds: 5, commentFeatures: [], finishingPosition: null, finalSp: null, marketImpliedProbability: null, marketRank: null }],
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

test("category/status mappings expose the four real streams only", () => {
  assert.deepEqual(Object.values(RESEARCH_SIGNALS).map((signal) => signal.category), ["VALUE", "VALUE", "VALUE", "SHADOW"]);
  assert.equal(RESEARCH_STATUS.length, 7);
  assert.deepEqual(buildResearchDashboard(inputs()).monitors.map((monitor) => monitor.status), ["FROZEN", "MONITORING", "MONITORING", "SHADOW"]);
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
