import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  attachTissueValueSnapshots,
  buildForwardValueRecord,
  edgeBand,
  emptyForwardValueData,
  enrichForwardValuePriceSnapshots,
  formatForwardValueRaceTime,
  forwardValuePriceSnapshot,
  isCleanPhase2Observation,
  isCleanSettledPhase2Observation,
  settleForwardValueRecords,
  renderForwardValueToday,
  priceSnapshotStage,
  tissueValueAgreement,
  upsertForwardValueRecords,
  valueExclusionReason,
  valueSampleStatus,
  type FamilyCalibration,
} from "./forward-value";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";

const calibration: FamilyCalibration = {
  family: "turf",
  calibrationVersion: "TPR_CAL_V1",
  ratingVersion: "TPR_S2_V1",
  leaderProbability: .25,
  gapQuartiles: [.2, .5, 1],
  gapBands: [
    { key: "Q1", minimumGap: null, maximumGap: .2, selections: 10, winners: 2, probability: .2 },
    { key: "Q2", minimumGap: .2, maximumGap: .5, selections: 10, winners: 3, probability: .3 },
    { key: "Q3", minimumGap: .5, maximumGap: 1, selections: 10, winners: 4, probability: .4 },
    { key: "Q4", minimumGap: 1, maximumGap: null, selections: 10, winners: 5, probability: .5 },
  ],
};

describe("forward value capture", () => {
  test("captures pre-race price and freezes the selected leader", () => {
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z") });
    assert.equal(record?.leaderHorseName, "Leader");
    assert.equal(record?.calibratedProbability, .4);
    assert.equal(record?.capturedDecimalOdds, 5);
    assert.equal(record?.capturedMarketProbability, .2);
    assert.ok(Math.abs((record?.edgePercentagePoints ?? 0) - 20) < 1e-9);
    assert.deepEqual(record?.marketFavouriteHorseNames, ["Other"]);
    assert.equal(record?.priceSource, "sporting_life_imported_racecard");
    assert.equal(record?.priceCapturedAt, "2026-09-27T12:00:00.000Z");
    assert.equal(record?.minutesBeforeScheduledOff, 60);
    assert.equal(record?.leaderIsMarketFavourite, false);
    assert.equal(record?.earlyPriceSnapshot?.decimalPrice, 5);
    assert.equal(record?.earlyPriceSnapshot?.ratingProbability, .4);
  });

  test("refuses post-start capture", () => {
    assert.equal(buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T13:00:00Z") }), null);
  });

  test("upsert is idempotent", () => {
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    const once = upsertForwardValueRecords(emptyForwardValueData(), [record]);
    assert.equal(upsertForwardValueRecords(once, [record]), once);
  });

  test("an earlier frozen price cannot be overwritten", () => {
    const early = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    const laterRace = race();
    laterRace.runners[0] = { ...laterRace.runners[0]!, odds: "2", oddsDecimal: "2" };
    const later = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: laterRace, calibration, recordedAt: new Date("2026-09-27T12:30:00Z") })!;
    const updated = upsertForwardValueRecords({ ...emptyForwardValueData(), races: [early] }, [later]);
    assert.equal(updated.races[0]!.capturedDecimalOdds, 5);
    assert.equal(updated.races[0]!.priceCapturedAt, "2026-09-27T12:00:00.000Z");
  });

  test("adds immutable T-60 and T-15 snapshots without changing the early freeze", () => {
    const early = buildForwardValueRecord({
      family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration,
      recordedAt: new Date("2026-09-27T11:00:00Z"),
    })!;
    const t60Race = raceWithLeaderPrice("4");
    const atT60 = enrichForwardValuePriceSnapshots({ ...emptyForwardValueData(), races: [early] }, {
      family: "turf", meetings: meetings(t60Race), capturedAt: new Date("2026-09-27T12:00:00Z"),
    });
    const t15Race = raceWithLeaderPrice("3");
    const atT15 = enrichForwardValuePriceSnapshots(atT60, {
      family: "turf", meetings: meetings(t15Race), capturedAt: new Date("2026-09-27T12:45:00Z"),
    });
    const attemptedOverwrite = enrichForwardValuePriceSnapshots(atT15, {
      family: "turf", meetings: meetings(raceWithLeaderPrice("2")), capturedAt: new Date("2026-09-27T12:50:00Z"),
    });
    const record = attemptedOverwrite.races[0]!;
    assert.equal(record.capturedDecimalOdds, 5);
    assert.equal(record.earlyPriceSnapshot?.decimalPrice, 5);
    assert.equal(record.t60PriceSnapshot?.decimalPrice, 4);
    assert.equal(record.t15PriceSnapshot?.decimalPrice, 3);
    assert.equal(record.t15PriceSnapshot?.capturedAt, "2026-09-27T12:45:00.000Z");
    assert.equal(record.calibratedProbability, .4);
    assert.equal(record.t60PriceSnapshot?.ratingProbability, .4);
    assert.ok(Math.abs((record.t60PriceSnapshot?.ratingEdgePercentagePoints ?? 0) - 15) < 1e-9);
    assert.ok(Math.abs((record.t15PriceSnapshot?.ratingEdgePercentagePoints ?? 0) - (40 - 100 / 3)) < 1e-9);
    assert.equal(attemptedOverwrite.races.length, 1);
  });

  test("uses non-overlapping windows and does not reconstruct a missed snapshot", () => {
    assert.equal(priceSnapshotStage(75), "t60");
    assert.equal(priceSnapshotStage(45), "t60");
    assert.equal(priceSnapshotStage(44.99), null);
    assert.equal(priceSnapshotStage(25), "t15");
    assert.equal(priceSnapshotStage(5), "t15");
    assert.equal(priceSnapshotStage(4.99), null);
    const early = buildForwardValueRecord({
      family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration,
      recordedAt: new Date("2026-09-27T11:00:00Z"),
    })!;
    const onlyT15 = enrichForwardValuePriceSnapshots({ ...emptyForwardValueData(), races: [early] }, {
      family: "turf", meetings: meetings(raceWithLeaderPrice("3")), capturedAt: new Date("2026-09-27T12:45:00Z"),
    }).races[0]!;
    assert.equal(forwardValuePriceSnapshot(onlyT15, "t60"), null);
    assert.equal(forwardValuePriceSnapshot(onlyT15, "t15")?.decimalPrice, 3);
  });

  test("fills the first valid early price without changing the frozen rating", () => {
    const missingRace = raceWithLeaderPrice(null);
    const missing = buildForwardValueRecord({
      family: "turf", raceDate: "2026-09-27", course: "Test", race: missingRace, calibration,
      recordedAt: new Date("2026-09-27T11:00:00Z"),
    })!;
    const enriched = enrichForwardValuePriceSnapshots({ ...emptyForwardValueData(), races: [missing] }, {
      family: "turf", meetings: meetings(raceWithLeaderPrice("4")), capturedAt: new Date("2026-09-27T12:00:00Z"),
    }).races[0]!;
    assert.equal(enriched.capturedDecimalOdds, 4);
    assert.equal(enriched.earlyPriceSnapshot?.capturedAt, "2026-09-27T12:00:00.000Z");
    assert.equal(enriched.t60PriceSnapshot?.decimalPrice, 4);
    assert.equal(enriched.calibratedProbability, .4);
    assert.equal(valueExclusionReason(enriched), null);
  });

  test("settles with canonical winner SP without recomputing capture", () => {
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    const result = race();
    result.runners[0] = { ...result.runners[0]!, odds: "3/1", oddsDecimal: "4", finishingPosition: 1, resultStatus: "finished", turfPerformanceRating: undefined };
    result.runners[1] = { ...result.runners[1]!, finishingPosition: 2, resultStatus: "finished" };
    const settled = settleForwardValueRecords({ ...emptyForwardValueData(), races: [record] }, new Map([[result.raceId, result]])).data.races[0]!;
    assert.equal(settled.leaderHorseName, "Leader");
    assert.equal(settled.calibratedProbability, .4);
    assert.equal(settled.capturedDecimalOdds, 5);
    assert.equal(settled.finalSp, 4);
    assert.equal(settled.profitLoss, 3);
    assert.equal(settled.capturedPriceProfitLoss, 4);
    assert.equal(isCleanSettledPhase2Observation(settled), true);
  });

  test("genuine non-runner is void while a started non-finisher is a loser", () => {
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    const nonRunner = resultRace("non_runner");
    assert.equal(settleForwardValueRecords({ ...emptyForwardValueData(), races: [record] }, new Map([[nonRunner.raceId, nonRunner]])).data.races[0]!.profitLoss, null);
    assert.equal(valueExclusionReason(settleForwardValueRecords({ ...emptyForwardValueData(), races: [record] }, new Map([[nonRunner.raceId, nonRunner]])).data.races[0]!), "non_runner");
    const dnf = resultRace("pulled_up");
    assert.equal(settleForwardValueRecords({ ...emptyForwardValueData(), races: [record] }, new Map([[dnf.raceId, dnf]])).data.races[0]!.profitLoss, -1);
  });

  test("attaches only genuine pre-race Tissue snapshots", () => {
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    const data = { ...emptyForwardValueData(), races: [record] };
    assert.equal(attachTissueValueSnapshots(data, new Map([[record.raceId, { runnerId: "one", horseName: "Leader", probability: .31, recordedPreRace: false }]])), data);
    assert.equal(attachTissueValueSnapshots(data, new Map([[record.raceId, { runnerId: "one", horseName: "Leader", probability: .31, recordedPreRace: true }]])).races[0]!.tissueProbability, .31);
  });

  test("uses fixed edge bands", () => {
    assert.deepEqual([-1, 0, .1, 2, 2.1, 5, 5.1, 10, 10.1].map(edgeBand), ["<=0pp", "<=0pp", ">0-2pp", ">0-2pp", ">2-5pp", ">2-5pp", ">5-10pp", ">5-10pp", ">10pp"]);
  });

  test("calculates negative edge and excludes a missing price", () => {
    const negative = race();
    negative.runners[0] = { ...negative.runners[0]!, odds: "2", oddsDecimal: "2" };
    const negativeRecord = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: negative, calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    assert.ok((negativeRecord.edgePercentagePoints ?? 0) < 0);
    const missing = race();
    missing.runners[0] = { ...missing.runners[0]!, odds: null, oddsDecimal: null };
    const missingRecord = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: missing, calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    assert.equal(valueExclusionReason(missingRecord), "missing_price");
    assert.equal(isCleanPhase2Observation(missingRecord), false);
  });

  test("classifies post-off and retrospective observations as excluded", () => {
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    assert.equal(valueExclusionReason({ ...record, priceCapturedAt: "2026-09-27T13:00:00Z" }), "captured_after_off");
    assert.equal(valueExclusionReason({ ...record, recordedPreRace: false }), "retrospective_or_non_prospective");
  });

  test("settles a dead heat at the captured price", () => {
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    const result = race();
    result.runners[0] = { ...result.runners[0]!, finishingPosition: 1, resultStatus: "finished" };
    result.runners[1] = { ...result.runners[1]!, finishingPosition: 1, resultStatus: "finished" };
    const settled = settleForwardValueRecords({ ...emptyForwardValueData(), races: [record] }, new Map([[result.raceId, result]])).data.races[0]!;
    assert.equal(settled.capturedPriceGrossReturn, 3);
    assert.equal(settled.capturedPriceProfitLoss, 2);
  });

  test("labels sparse samples without changing eligibility", () => {
    assert.deepEqual([0, 24, 25, 99, 100, 249, 250].map(valueSampleStatus), ["VERY EARLY", "VERY EARLY", "EARLY", "EARLY", "DEVELOPING", "DEVELOPING", "USABLE FOR INITIAL ASSESSMENT"]);
  });

  test("captures Tissue price and compares value signs", () => {
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z"), tissue: { runnerId: "one", horseName: "Leader", probability: .3 } })!;
    assert.equal(record.tissueCapturedDecimalOdds, 5);
    assert.ok(Math.abs((record.tissueEdgePercentagePoints ?? 0) - 10) < 1e-9);
    assert.equal(tissueValueAgreement(record), "both_positive");
  });

  test("renders a read-only today row", () => {
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    const output = renderForwardValueToday({ ...emptyForwardValueData(), races: [record] }, "2026-09-27");
    assert.match(output, /TPR \/ Turf \| Leader \| model 40\.0%/);
    assert.match(output, /14:00 Test - Test Handicap/);
    assert.match(output, /leader favourite no/);
    assert.match(output, /included in prospective analysis/);
  });

  test("formats Forward Value race times with canonical UK BST and GMT rules", () => {
    const summer = {
      raceDateTime: "2026-09-27T13:00:00.000Z",
      raceTime: "13:00",
    };
    const winter = {
      raceDateTime: "2026-12-27T13:00:00.000Z",
      raceTime: "13:00",
    };
    const storedTimestamp = summer.raceDateTime;
    assert.equal(formatForwardValueRaceTime(summer), "14:00");
    assert.equal(formatForwardValueRaceTime(winter), "13:00");
    assert.equal(summer.raceDateTime, storedTimestamp);
  });

  test("pure Phase 2 analysis does not mutate frozen artifacts", async () => {
    const paths = ["data/research/forward-value-calibration-v1.json", "data/research/forward-value-v1.json"];
    const before = await Promise.all(paths.map((path) => readFile(path, "utf8")));
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    renderForwardValueToday({ ...emptyForwardValueData(), races: [record] }, "2026-09-27");
    const after = await Promise.all(paths.map((path) => readFile(path, "utf8")));
    assert.deepEqual(after, before);
  });
});

function race(): TodayRace {
  return {
    raceId: "race-1", sourceId: null, scheduledTime: "13:00", raceDateTime: new Date("2026-09-27T13:00:00Z"),
    courseCountry: "GB", raceName: "Test Handicap", raceClass: "Class 4", raceType: "Handicap", raceTypeCode: "Flat",
    distance: "1m", distanceYards: 1760, going: "Good", surface: "Turf", declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null,
    runners: [runner("one", "Leader", "5", 1, .7), runner("two", "Other", "3", 2, null)],
  };
}

function runner(id: string, horseName: string, oddsDecimal: string, rank: number, gap: number | null): TodayRunner {
  return {
    runnerId: id, runnerSourceId: null, horseId: id, horseName, saddleclothNumber: null, horseAge: null, horseSex: null,
    weight: null, weightCarriedLbs: null, draw: null, jockeyName: null, trainerId: null, trainerName: null, officialRating: null,
    odds: oddsDecimal, oddsDecimal, resultStatus: null, finishingPosition: null, metrics: null,
    turfPerformanceRating: { version: "TPR_S2_V1", rating: rank === 1 ? 10 : 9.3, rawRating: 0, historyDepth: 3, rank, gap },
  };
}

function resultRace(leaderStatus: string): TodayRace {
  const value = race();
  value.runners[0] = { ...value.runners[0]!, resultStatus: leaderStatus, finishingPosition: null };
  value.runners[1] = { ...value.runners[1]!, resultStatus: "finished", finishingPosition: 1 };
  return value;
}

function raceWithLeaderPrice(oddsDecimal: string | null): TodayRace {
  const value = race();
  value.runners[0] = { ...value.runners[0]!, odds: oddsDecimal, oddsDecimal };
  return value;
}

function meetings(value: TodayRace): TodayMeeting[] {
  return [{ courseId: "test", courseSourceId: null, courseName: "Test", country: "GB", order: 0, races: [value] }];
}
