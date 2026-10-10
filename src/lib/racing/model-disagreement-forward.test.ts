import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildModelDisagreementObservations,
  emptyModelDisagreementForwardData,
  movementLabel,
  priceMovements,
  refreshModelDisagreementSnapshots,
  settleModelDisagreementObservations,
  upsertModelDisagreementObservations,
  type DisagreementMarketSnapshot,
} from "./model-disagreement-forward";
import { FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION } from "./forward-value";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";

const date = "2026-10-10";

describe("model disagreement prospective tracker", () => {
  test("starts a fresh prospective epoch with no historical backfill", () => {
    const data = emptyModelDisagreementForwardData();
    assert.equal(data.version, "MODEL_DISAGREEMENT_FORWARD_V1");
    assert.equal(data.epoch, "2026-10-09T00:00:00.000Z");
    assert.deepEqual(data.observations, []);
    assert.match(data.notes.join(" "), /No historical observations are backfilled/);
    assert.match(data.notes.join(" "), /FIRST_NEXT_DAY_CAPTURE/);
  });

  test("captures night once and preserves frozen evidence on duplicate sync", () => {
    let data = emptyModelDisagreementForwardData();
    const night = new Date("2026-10-09T19:00:00Z");
    const candidates = buildModelDisagreementObservations({ meetings: [meeting(6)], raceDate: date, capturePoint: "NIGHT_BEFORE", recordedAt: night });
    data = upsertModelDisagreementObservations(data, candidates);
    data = upsertModelDisagreementObservations(data, buildModelDisagreementObservations({ meetings: [meeting(4)], raceDate: date, capturePoint: "NIGHT_BEFORE", recordedAt: new Date("2026-10-09T19:05:00Z") }));
    assert.equal(data.observations.length, 2);
    assert.equal(data.observations[0].snapshots.NIGHT_BEFORE?.medianBookmakerDecimal, 6);
    assert.equal(data.observations[0].frozen.firstQualifyingSnapshot?.medianBookmakerDecimal, 6);
  });

  test("later captures do not overwrite earlier snapshots and final pre-race is genuine pre-off only", () => {
    let data = upsertModelDisagreementObservations(emptyModelDisagreementForwardData(),
      buildModelDisagreementObservations({ meetings: [meeting(6)], raceDate: date, capturePoint: "NIGHT_BEFORE", recordedAt: new Date("2026-10-09T19:00:00Z") }));
    data = refreshModelDisagreementSnapshots(data, raceMap(5), "EARLY_MORNING", new Date("2026-10-10T07:00:00Z"));
    data = refreshModelDisagreementSnapshots(data, raceMap(4), "EARLY_MORNING", new Date("2026-10-10T07:05:00Z"));
    data = refreshModelDisagreementSnapshots(data, raceMap(4.5), "LATE_MORNING", new Date("2026-10-10T10:30:00Z"));
    data = refreshModelDisagreementSnapshots(data, raceMap(3.5), "FINAL_PRE_RACE", new Date("2026-10-10T12:55:00Z"));
    data = refreshModelDisagreementSnapshots(data, raceMap(2), "FINAL_PRE_RACE", new Date("2026-10-10T13:05:00Z"));
    const row = data.observations[0];
    assert.equal(row.snapshots.NIGHT_BEFORE?.medianBookmakerDecimal, 6);
    assert.equal(row.snapshots.EARLY_MORNING?.medianBookmakerDecimal, 5);
    assert.equal(row.snapshots.LATE_MORNING?.medianBookmakerDecimal, 4.5);
    assert.equal(row.snapshots.FINAL_PRE_RACE?.medianBookmakerDecimal, 3.5);
    assert.equal(row.movements.find((movement) => movement.from === "NIGHT_BEFORE" && movement.to === "FINAL_PRE_RACE")?.label, "STRONG SHORTEN");
  });

  test("missing snapshots remain missing and SP is not substituted for pre-race prices", () => {
    const initial = upsertModelDisagreementObservations(emptyModelDisagreementForwardData(),
      buildModelDisagreementObservations({ meetings: [meeting(null)], raceDate: date, capturePoint: "NIGHT_BEFORE", recordedAt: new Date("2026-10-09T19:00:00Z") }));
    assert.equal(initial.observations[0].snapshots.NIGHT_BEFORE, undefined);
    const settled = settleModelDisagreementObservations(initial, settledRaceMap("5"), new Date("2026-10-10T13:10:00Z")).data;
    assert.equal(settled.observations[0].snapshots.FINAL_PRE_RACE, undefined);
    assert.equal(settled.observations[0].finalSp, 5);
  });

  test("non-final captures do not populate the final pre-race slot", () => {
    let data = upsertModelDisagreementObservations(emptyModelDisagreementForwardData(),
      buildModelDisagreementObservations({ meetings: [meeting(6)], raceDate: date, capturePoint: "NIGHT_BEFORE", recordedAt: new Date("2026-10-09T13:30:00Z") }));
    data = refreshModelDisagreementSnapshots(data, raceMap(5), "EARLY_MORNING", new Date("2026-10-10T07:00:00Z"));
    data = refreshModelDisagreementSnapshots(data, raceMap(4.5), "LATE_MORNING", new Date("2026-10-10T10:30:00Z"));

    assert.equal(data.observations[0].snapshots.NIGHT_BEFORE?.medianBookmakerDecimal, 6);
    assert.equal(data.observations[0].snapshots.EARLY_MORNING?.medianBookmakerDecimal, 5);
    assert.equal(data.observations[0].snapshots.LATE_MORNING?.medianBookmakerDecimal, 4.5);
    assert.equal(data.observations[0].snapshots.FINAL_PRE_RACE, undefined);
  });

  test("movement calculation uses fixed descriptive thresholds", () => {
    assert.equal(movementLabel(-0.25), "STRONG SHORTEN");
    assert.equal(movementLabel(-0.05), "SHORTEN");
    assert.equal(movementLabel(0.00), "STABLE");
    assert.equal(movementLabel(0.10), "DRIFT");
    assert.equal(movementLabel(0.25), "STRONG DRIFT");
    const movements = priceMovements({ NIGHT_BEFORE: snap("NIGHT_BEFORE", 6), EARLY_MORNING: snap("EARLY_MORNING", 5), FINAL_PRE_RACE: snap("FINAL_PRE_RACE", 4) });
    assert.equal(movements.length, 3);
    assert.equal(movements[0].decimalPriceChange, -1);
    assert.ok(movements[1].impliedProbabilityChange > 0);
  });
});

function meeting(price: number | null): TodayMeeting {
  return { courseId: "course", courseSourceId: "1", courseName: "Teston", country: "GB", order: 1, races: [race(price)] };
}

function race(price: number | null): TodayRace {
  return { raceId: "race", sourceId: "source", scheduledTime: "13:00", raceDateTime: new Date("2026-10-10T13:00:00Z"), courseCountry: "GB",
    raceName: "Test Hurdle", raceClass: "Class 4", raceType: "Hurdle", raceTypeCode: "HURDLE", distance: null, distanceYards: 3520, going: "Good",
    surface: "TURF", declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null,
    runners: [runner("a", "Alpha", price, 1, .3), runner("b", "Bravo", 8, 2, .15)] };
}

function runner(id: string, name: string, price: number | null, rank: number, probability: number): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: `h-${id}`, horseName: name, saddleclothNumber: rank, horseAge: 6, horseSex: null,
    weight: null, weightCarriedLbs: 160, draw: null, jockeyName: null, trainerId: null, trainerName: null, officialRating: 120 - rank,
    odds: null, oddsDecimal: null, forecastOdds: null, forecastDecimalOdds: null, resultStatus: null, finishingPosition: null,
    bookmakerQuotes: price === null ? [] : [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: null, decimalOdds: price }],
    metrics: { averageJumpSpeedLast3: 100 - rank, latestJumpSpeedRating: 101 - rank, previousJumpSpeedRating: 95, bestJumpSpeedLast3: 102 - rank } as TodayRunner["metrics"],
    jumpRating: { runnerId: id, components: { averageJumpSpeedLast3: rank, trainerPriorStrikeRate: null, officialRating: rank }, jprA: { score: 100 - rank, rank }, jprB: null } as unknown as TodayRunner["jumpRating"],
    jumpTissue: { runnerId: id, rank, probability } as TodayRunner["jumpTissue"] };
}

function raceMap(price: number | null) {
  return new Map([["race", race(price)]]);
}

function settledRaceMap(sp: string) {
  const settled = race(null);
  settled.actualRunnerCount = 2;
  settled.winningTime = "4m 0s";
  settled.runners[0].finishingPosition = 1;
  settled.runners[0].oddsDecimal = sp;
  settled.runners[1].finishingPosition = 2;
  settled.runners[1].oddsDecimal = "8";
  return new Map([["race", settled]]);
}

function snap(capturePoint: DisagreementMarketSnapshot["capturePoint"], price: number): DisagreementMarketSnapshot {
  return { capturePoint, capturedAt: `2026-10-10T0${price}:00:00Z`, medianBookmakerDecimal: price, impliedProbability: 1 / price,
    bestBookmakerDecimal: price, bestBookmakerFractional: null, bestBookmakerName: null, bookmakerQuoteCount: 1, bookmakerQuotes: [],
    marketPriceBasisVersion: FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION };
}
