import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  attachTissueValueSnapshots,
  buildForwardValueRecord,
  edgeBand,
  emptyForwardValueData,
  enrichForwardValuePriceSnapshots,
  FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION,
  FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION,
  formatForwardValueRaceTime,
  isCleanPhase2Observation,
  isCleanSettledPhase2Observation,
  settleForwardValueRecords,
  renderForwardValueToday,
  priceSnapshotStage,
  summarizeBookmakerMarket,
  tissueValueAgreement,
  upsertForwardValueRecords,
  valueExclusionReason,
  valueSampleStatus,
  type FamilyCalibration,
  type ForwardValueRecord,
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

const awCalibration: FamilyCalibration = {
  family: "aw",
  calibrationVersion: "AW_CAL_V1",
  ratingVersion: "AW_D_V1",
  leaderProbability: .2,
  gapQuartiles: [],
  gapBands: [],
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
    assert.equal(record?.priceSnapshotScheduleVersion, FORWARD_VALUE_PRICE_SNAPSHOT_SCHEDULE_VERSION);
    assert.equal(record?.marketPriceBasisVersion, FORWARD_VALUE_MARKET_PRICE_BASIS_VERSION);
    assert.equal(record?.bookmakerQuoteCount, 1);
  });

  test("refuses post-start capture", () => {
    assert.equal(buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T13:00:00Z") }), null);
  });

  test("does not create an AW-D Forward Value leader when rating coverage is insufficient", () => {
    const sparse = awRaceWithRatedCount(11, 1);
    assert.equal(sparse.runners[0]?.awRating?.awD?.rank, 1);
    assert.equal(
      buildForwardValueRecord({
        family: "aw",
        raceDate: "2026-09-27",
        course: "Kempton",
        race: sparse,
        calibration: awCalibration,
        recordedAt: new Date("2026-09-27T12:00:00Z"),
      }),
      null,
    );
  });

  test("does not create TPR or JPR-A Forward Value leaders when rating coverage is insufficient", () => {
    assert.equal(buildForwardValueRecord({
      family: "turf",
      raceDate: "2026-09-27",
      course: "Ascot",
      race: sparseTprRace(),
      calibration,
      recordedAt: new Date("2026-09-27T12:00:00Z"),
    }), null);
    assert.equal(buildForwardValueRecord({
      family: "jump",
      raceDate: "2026-09-27",
      course: "Sligo",
      race: sparseJumpRace(),
      calibration: { ...awCalibration, family: "jump", calibrationVersion: "JPR_CAL_V1", ratingVersion: "JPR_A_V1" },
      recordedAt: new Date("2026-09-27T12:00:00Z"),
    }), null);
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

  for (const minutes of [210, 180, 150]) {
    test(`captures the first T-180 quote at ${minutes} minutes before off`, () => {
      assert.equal(priceSnapshotStage(minutes), "t180");
      const record = enrichNewScheduleAt(minutes, "4");
      assert.equal(record.t180PriceSnapshot?.price, null);
      assert.equal(record.t180PriceSnapshot?.decimalPrice, 4);
      assert.equal(record.t180PriceSnapshot?.minutesBeforeScheduledOff, minutes);
      assert.equal(record.t180PriceSnapshot?.ratingProbability, .4);
      assert.ok(Math.abs((record.t180PriceSnapshot?.ratingEdgePercentagePoints ?? 0) - 15) < 1e-9);
    });
  }

  test("does not capture T-180 outside its inclusive window", () => {
    assert.equal(priceSnapshotStage(210.01), null);
    assert.equal(priceSnapshotStage(149.99), null);
    assert.equal(enrichNewScheduleAt(210.01, "4").t180PriceSnapshot, null);
    assert.equal(enrichNewScheduleAt(149.99, "4").t180PriceSnapshot, null);
  });

  for (const minutes of [90, 60, 30]) {
    test(`captures the first T-60 quote at ${minutes} minutes before off`, () => {
      assert.equal(priceSnapshotStage(minutes), "t60");
      const record = enrichNewScheduleAt(minutes, "4");
      assert.equal(record.t60PriceSnapshot?.decimalPrice, 4);
      assert.equal(record.t60PriceSnapshot?.minutesBeforeScheduledOff, minutes);
    });
  }

  test("does not overwrite Early, T-180, or T-60 after the first valid quote", () => {
    const early = newScheduleEarly();
    const atT180 = enrichAtMinutes(early, 210, "4");
    const t180Overwrite = enrichAtMinutes(atT180, 180, "3");
    const atT60 = enrichAtMinutes(t180Overwrite, 90, "6");
    const t60Overwrite = enrichAtMinutes(atT60, 60, "2");
    assert.equal(t60Overwrite.capturedDecimalOdds, 5);
    assert.equal(t60Overwrite.earlyPriceSnapshot?.decimalPrice, 5);
    assert.equal(t60Overwrite.t180PriceSnapshot?.decimalPrice, 4);
    assert.equal(t60Overwrite.t60PriceSnapshot?.decimalPrice, 6);
  });

  test("freezes the full bookmaker set, best provider, and forecast at each snapshot", () => {
    const initial = newScheduleEarly();
    const firstRace = raceWithLeaderPrice("4");
    firstRace.runners[0] = {
      ...firstRace.runners[0]!,
      forecastOdds: "10/1",
      forecastDecimalOdds: 11,
      bookmakerQuotes: [
        { bookmakerId: 1, bookmakerName: "Book One", fractionalOdds: "3/1", decimalOdds: 4 },
        { bookmakerId: 2, bookmakerName: "Book Two", fractionalOdds: "4/1", decimalOdds: 5 },
        { bookmakerId: 3, bookmakerName: "Book Three", fractionalOdds: "5/1", decimalOdds: 6 },
      ],
    };
    const capture = (record: ForwardValueRecord, value: TodayRace, minutes: number) => enrichForwardValuePriceSnapshots(
      { ...emptyForwardValueData(), races: [record] },
      { family: "turf", meetings: meetings(value), capturedAt: new Date(new Date(record.raceDateTime).getTime() - minutes * 60_000) },
    ).races[0]!;
    const frozen = capture(initial, firstRace, 180);
    const changedRace = raceWithLeaderPrice("2");
    changedRace.runners[0] = { ...changedRace.runners[0]!, bookmakerQuotes: quotes(2, 3, 4) };
    const unchanged = capture(frozen, changedRace, 170);
    assert.equal(unchanged.t180PriceSnapshot?.medianBookmakerPriceDecimal, 5);
    assert.equal(unchanged.t180PriceSnapshot?.bestBookmakerPriceDecimal, 6);
    assert.equal(unchanged.t180PriceSnapshot?.bestBookmakerName, "Book Three");
    assert.equal(unchanged.t180PriceSnapshot?.forecastPrice, "10/1");
    assert.equal(unchanged.t180PriceSnapshot?.bookmakerQuotes?.length, 3);
  });

  test("leaves missed new-schedule windows null and does not populate T-15", () => {
    const afterT180 = enrichAtMinutes(newScheduleEarly(), 149, "4");
    const afterT15 = enrichAtMinutes(afterT180, 15, "3");
    assert.equal(afterT15.t180PriceSnapshot, null);
    assert.equal(afterT15.t60PriceSnapshot, null);
    assert.equal(afterT15.t15PriceSnapshot, undefined);
  });

  test("leaves an existing legacy T-15 record byte-for-byte unchanged", () => {
    const current = newScheduleEarly();
    const legacySnapshot = {
      decimalPrice: 3,
      impliedProbability: 1 / 3,
      capturedAt: "2026-09-27T12:45:00.000Z",
      minutesBeforeScheduledOff: 15,
      ratingProbability: .4,
      ratingEdgePercentagePoints: 40 - 100 / 3,
    };
    const legacy = asLegacyRecord(current);
    const legacyRecord = { ...legacy, t15PriceSnapshot: legacySnapshot };
    const before = JSON.stringify(legacyRecord);
    const enriched = enrichAtMinutes(legacyRecord, 10, "2");
    assert.equal(JSON.stringify(enriched), before);
    assert.deepEqual(enriched.t15PriceSnapshot, legacySnapshot);
    assert.equal(enriched.t180PriceSnapshot, undefined);
  });

  test("continues to capture legacy T-60 and T-15 windows only for unversioned records", () => {
    assert.equal(priceSnapshotStage(75, null), "t60");
    assert.equal(priceSnapshotStage(45, null), "t60");
    assert.equal(priceSnapshotStage(25, null), "t15");
    assert.equal(priceSnapshotStage(5, null), "t15");
    const current = newScheduleEarly();
    const legacy = asLegacyRecord(current);
    const captured = enrichAtMinutes(legacy, 15, "3");
    assert.equal(captured.t15PriceSnapshot?.decimalPrice, 3);
    assert.equal(captured.t180PriceSnapshot, undefined);
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

  test("persists median, best-bookmaker, and final-SP returns separately", () => {
    const priced = race();
    priced.runners[0] = { ...priced.runners[0]!, bookmakerQuotes: quotes(4, 5, 6) };
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: priced, calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    const result = race();
    result.runners[0] = { ...result.runners[0]!, odds: "3/1", oddsDecimal: "4", finishingPosition: 1, resultStatus: "finished", turfPerformanceRating: undefined };
    result.runners[1] = { ...result.runners[1]!, finishingPosition: 2, resultStatus: "finished" };
    const settled = settleForwardValueRecords({ ...emptyForwardValueData(), races: [record] }, new Map([[result.raceId, result]])).data.races[0]!;
    assert.equal(settled.medianMarketPriceProfitLoss, 4);
    assert.equal(settled.bestBookmakerPriceProfitLoss, 5);
    assert.equal(settled.profitLoss, 3);
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

  test("late Tissue attachment freezes its own bookmaker median", () => {
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T08:00:00Z") })!;
    const attached = attachTissueValueSnapshots({ ...emptyForwardValueData(), races: [record] }, new Map([[record.raceId, {
      runnerId: "two",
      horseName: "Other",
      probability: .22,
      recordedPreRace: true,
      capturedPrice: "20/1",
      capturedDecimalOdds: 21,
      priceCapturedAt: "2026-09-27T10:00:00.000Z",
      forecastPrice: "20/1",
      forecastDecimalPrice: 21,
      bookmakerQuotes: quotes(8, 10, 12),
    }]])).races[0]!;
    assert.equal(attached.tissueCapturedDecimalOdds, 10);
    assert.equal(attached.tissueMarketProbability, .1);
    assert.equal(attached.tissueEdgePercentagePoints, 12);
    assert.equal(attached.tissueForecastPrice, "20/1");
    assert.equal(attached.tissueBookmakerQuoteCount, 3);
    assert.equal(attached.tissueT180PriceSnapshot?.decimalPrice, 10);
  });

  test("uses fixed edge bands", () => {
    assert.deepEqual([-1, 0, .1, 2, 2.1, 5, 5.1, 10, 10.1].map(edgeBand), ["<=0pp", "<=0pp", ">0-2pp", ">0-2pp", ">2-5pp", ">2-5pp", ">5-10pp", ">5-10pp", ">10pp"]);
  });

  test("calculates negative edge and excludes a missing price", () => {
    const negative = race();
    negative.runners[0] = { ...negative.runners[0]!, odds: "2", oddsDecimal: "2", bookmakerQuotes: quotes(2) };
    const negativeRecord = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: negative, calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    assert.ok((negativeRecord.edgePercentagePoints ?? 0) < 0);
    const missing = race();
    missing.runners[0] = { ...missing.runners[0]!, odds: null, oddsDecimal: null, bookmakerQuotes: [] };
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

  test("uses the deterministic median for odd and even bookmaker quote counts", () => {
    assert.equal(summarizeBookmakerMarket(quotes(4, 5, 9)).decimalPrice, 5);
    assert.equal(summarizeBookmakerMarket(quotes(4, 6, 8, 10)).decimalPrice, 7);
  });

  test("Cross Of Stars uses the bookmaker median instead of the 20/1 forecast", () => {
    const cross = race();
    cross.runners[0] = {
      ...cross.runners[0]!,
      horseName: "Cross Of Stars",
      odds: "20/1",
      oddsDecimal: "21",
      forecastOdds: "20/1",
      forecastDecimalOdds: 21,
      bookmakerQuotes: [
        { bookmakerId: 4, bookmakerName: "Betfair Sportsbook", fractionalOdds: "11/2", decimalOdds: 6.5 },
        { bookmakerId: 6, bookmakerName: "Paddy Power", fractionalOdds: "6/1", decimalOdds: 7 },
        { bookmakerId: 17, bookmakerName: "Sky Bet v2", fractionalOdds: "6/1", decimalOdds: 7 },
      ],
    };
    const customCalibration = { ...calibration, leaderProbability: .185, gapBands: [] };
    const record = buildForwardValueRecord({
      family: "turf", raceDate: "2026-09-27", course: "Cork", race: cross,
      calibration: customCalibration, recordedAt: new Date("2026-09-27T12:00:00Z"),
    })!;
    assert.equal(record.capturedDecimalOdds, 7);
    assert.equal(record.capturedMarketProbability, 1 / 7);
    assert.ok(Math.abs(record.edgePercentagePoints! - (.185 - 1 / 7) * 100) < 1e-9);
    assert.equal(record.forecastPrice, "20/1");
    assert.equal(record.forecastDecimalPrice, 21);
  });

  test("does not fall back to a forecast when bookmaker quotes are missing", () => {
    const noQuotes = race();
    noQuotes.runners[0] = { ...noQuotes.runners[0]!, bookmakerQuotes: [] };
    const record = buildForwardValueRecord({
      family: "turf", raceDate: "2026-09-27", course: "Test", race: noQuotes,
      calibration, recordedAt: new Date("2026-09-27T12:00:00Z"),
    })!;
    assert.equal(record.forecastPrice, "5");
    assert.equal(record.capturedDecimalOdds, null);
    assert.equal(record.edgePercentagePoints, null);
    assert.equal(valueExclusionReason(record), "missing_price");
  });

  test("uses each model-selected horse's own bookmaker median", () => {
    const value = race();
    value.runners[0] = { ...value.runners[0]!, bookmakerQuotes: quotes(4, 5, 6) };
    value.runners[1] = { ...value.runners[1]!, bookmakerQuotes: quotes(8, 10, 12) };
    const record = buildForwardValueRecord({
      family: "turf", raceDate: "2026-09-27", course: "Test", race: value, calibration,
      recordedAt: new Date("2026-09-27T12:00:00Z"),
      tissue: { runnerId: "two", horseName: "Other", probability: .2 },
    })!;
    assert.equal(record.capturedDecimalOdds, 5);
    assert.equal(record.tissueCapturedDecimalOdds, 10);
    assert.equal(record.capturedMarketProbability, .2);
    assert.equal(record.tissueMarketProbability, .1);
  });

  test("renders a read-only today row", () => {
    const record = buildForwardValueRecord({ family: "turf", raceDate: "2026-09-27", course: "Test", race: race(), calibration, recordedAt: new Date("2026-09-27T12:00:00Z") })!;
    const output = renderForwardValueToday({ ...emptyForwardValueData(), races: [record] }, "2026-09-27");
    assert.match(output, /TPR \/ Turf \| Leader \| model 40\.0%/);
    assert.match(output, /14:00 Test - Test Handicap/);
    assert.match(output, /leader favourite no/);
    assert.match(output, /included in prospective analysis/);
    assert.match(output, /Early .* \| T-180 - \| T-60 - \| SP -/);
    assert.doesNotMatch(output, /T-15/);
  });

  test("renders legacy T-15 without reinterpreting it as T-180", () => {
    const current = newScheduleEarly();
    const legacy = asLegacyRecord(current);
    const legacyRecord: ForwardValueRecord = {
      ...legacy,
      t15PriceSnapshot: {
        decimalPrice: 3,
        impliedProbability: 1 / 3,
        capturedAt: "2026-09-27T12:45:00.000Z",
        minutesBeforeScheduledOff: 15,
        ratingProbability: .4,
        ratingEdgePercentagePoints: 40 - 100 / 3,
      },
    };
    const output = renderForwardValueToday({ ...emptyForwardValueData(), races: [legacyRecord] }, "2026-09-27");
    assert.match(output, /T-15 3\.00/);
    assert.doesNotMatch(output, /T-180/);
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

function newScheduleEarly(): ForwardValueRecord {
  return buildForwardValueRecord({
    family: "turf",
    raceDate: "2026-09-27",
    course: "Test",
    race: race(),
    calibration,
    recordedAt: new Date("2026-09-27T08:00:00Z"),
  })!;
}

function asLegacyRecord(record: ForwardValueRecord): ForwardValueRecord {
  const legacy = { ...record };
  delete legacy.priceSnapshotScheduleVersion;
  delete legacy.marketPriceBasisVersion;
  delete legacy.marketPriceBasisImplementedAt;
  delete legacy.t180PriceSnapshot;
  return legacy;
}

function enrichNewScheduleAt(minutesBeforeOff: number, oddsDecimal: string): ForwardValueRecord {
  return enrichAtMinutes(newScheduleEarly(), minutesBeforeOff, oddsDecimal);
}

function enrichAtMinutes(record: ForwardValueRecord, minutesBeforeOff: number, oddsDecimal: string): ForwardValueRecord {
  const off = new Date(record.raceDateTime);
  const capturedAt = new Date(off.getTime() - minutesBeforeOff * 60_000);
  return enrichForwardValuePriceSnapshots({ ...emptyForwardValueData(), races: [record] }, {
    family: "turf",
    meetings: meetings(raceWithLeaderPrice(oddsDecimal)),
    capturedAt,
  }).races[0]!;
}

function race(): TodayRace {
  return {
    raceId: "race-1", sourceId: null, scheduledTime: "13:00", raceDateTime: new Date("2026-09-27T13:00:00Z"),
    courseCountry: "GB", raceName: "Test Handicap", raceClass: "Class 4", raceType: "Handicap", raceTypeCode: "Flat",
    distance: "1m", distanceYards: 1760, going: "Good", surface: "Turf", declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null,
    runners: [runner("one", "Leader", "5", 1, .7), runner("two", "Other", "3", 2, null)],
  };
}

function awRaceWithRatedCount(activeRunnerCount: number, ratedRunnerCount: number): TodayRace {
  return {
    raceId: "aw-race-1", sourceId: null, scheduledTime: "17:30", raceDateTime: new Date("2026-09-27T17:30:00Z"),
    courseCountry: "GB", raceName: "AW Maiden", raceClass: "Class 4", raceType: "Flat", raceTypeCode: "FLAT",
    distance: "1m", distanceYards: 1760, going: "Standard", surface: "ALLWEATHER", declaredRunnerCount: activeRunnerCount,
    actualRunnerCount: null, winningTime: null,
    awRatingCoverage: {
      awD: {
        activeRunnerCount,
        ratedRunnerCount,
        ratingCoverage: ratedRunnerCount / activeRunnerCount,
        ratingCoverageStatus: ratedRunnerCount >= 2 && ratedRunnerCount / activeRunnerCount >= .2 ? "eligible" : "insufficient_coverage",
        guardVersion: "aw_d_rating_coverage_guard_v1",
        guardImplementedAt: "2026-09-30T00:00:00.000Z",
      },
    },
    runners: Array.from({ length: activeRunnerCount }, (_, index) => awRunner(String(index + 1), index < ratedRunnerCount ? index + 1 : null)),
  };
}

function sparseTprRace(): TodayRace {
  const value = race();
  value.tprRatingCoverage = {
    activeRunnerCount: 11,
    ratedRunnerCount: 1,
    ratingCoverage: 1 / 11,
    ratingCoverageStatus: "insufficient_coverage",
    guardVersion: "tpr_rating_coverage_guard_v1",
    guardImplementedAt: "2026-09-30T00:00:00.000Z",
  };
  value.declaredRunnerCount = 11;
  value.runners = [
    value.runners[0]!,
    ...Array.from({ length: 10 }, (_, index) => ({
      ...value.runners[1]!,
      runnerId: `unrated-${index}`,
      horseId: `unrated-${index}`,
      horseName: `Unrated ${index + 1}`,
      turfPerformanceRating: undefined,
    })),
  ];
  return value;
}

function sparseJumpRace(): TodayRace {
  return {
    raceId: "jump-sparse", sourceId: null, scheduledTime: "14:00", raceDateTime: new Date("2026-09-27T14:00:00Z"),
    courseCountry: "GB", raceName: "Jump Sparse", raceClass: "Class 4", raceType: "Hurdle", raceTypeCode: "HUR",
    distance: "2m", distanceYards: 3520, going: "Good", surface: null, declaredRunnerCount: 11, actualRunnerCount: null,
    winningTime: null,
    jumpRatingCoverage: {
      jprA: {
        activeRunnerCount: 11,
        ratedRunnerCount: 1,
        ratingCoverage: 1 / 11,
        ratingCoverageStatus: "insufficient_coverage",
        guardVersion: "jpr_a_rating_coverage_guard_v1",
        guardImplementedAt: "2026-09-30T00:00:00.000Z",
      },
    },
    runners: Array.from({ length: 11 }, (_, index) => ({
      ...awRunner(String(index + 1), index === 0 ? 1 : null),
      jumpRating: {
        components: { averageJumpSpeedLast3: index === 0 ? 1 : null, trainerPriorStrikeRate: index === 0 ? 1 : null, officialRating: index + 1 },
        jprA: index === 0 ? { version: "JPR_A_V1", score: 1, rank: 1 } : null,
        jprB: null,
      },
      awRating: undefined,
    })),
  };
}

function awRunner(id: string, rank: number | null): TodayRunner {
  return {
    runnerId: id, runnerSourceId: null, horseId: `aw-${id}`, horseName: id === "1" ? "Kingdom Of Heaven" : `AW Runner ${id}`,
    saddleclothNumber: Number(id), horseAge: null, horseSex: null, weight: null, weightCarriedLbs: null,
    draw: null, jockeyName: null, trainerId: null, trainerName: null, officialRating: null,
    odds: "5", oddsDecimal: "5", resultStatus: null, finishingPosition: null, metrics: null,
    forecastOdds: "5", forecastDecimalOdds: 5, bookmakerQuotes: quotes(5),
    awRating: {
      components: { averageAwSpeedLast3: rank, trainerPriorStrikeRate: rank, jockeyPriorStrikeRate: rank },
      awD: rank === null ? null : { version: "AW_D_V1", score: rank, rank },
      awA: null,
    },
  };
}

function runner(id: string, horseName: string, oddsDecimal: string, rank: number, gap: number | null): TodayRunner {
  return {
    runnerId: id, runnerSourceId: null, horseId: id, horseName, saddleclothNumber: null, horseAge: null, horseSex: null,
    weight: null, weightCarriedLbs: null, draw: null, jockeyName: null, trainerId: null, trainerName: null, officialRating: null,
    odds: oddsDecimal, oddsDecimal, resultStatus: null, finishingPosition: null, metrics: null,
    forecastOdds: oddsDecimal, forecastDecimalOdds: Number(oddsDecimal), bookmakerQuotes: quotes(Number(oddsDecimal)),
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
  value.runners[0] = {
    ...value.runners[0]!,
    odds: oddsDecimal,
    oddsDecimal,
    forecastOdds: oddsDecimal,
    forecastDecimalOdds: oddsDecimal === null ? null : Number(oddsDecimal),
    bookmakerQuotes: oddsDecimal === null ? [] : quotes(Number(oddsDecimal)),
  };
  return value;
}

function quotes(...decimalOdds: number[]) {
  return decimalOdds.map((price, index) => ({
    bookmakerId: index + 1,
    bookmakerName: `Book ${index + 1}`,
    fractionalOdds: null,
    decimalOdds: price,
  }));
}

function meetings(value: TodayRace): TodayMeeting[] {
  return [{ courseId: "test", courseSourceId: null, courseName: "Test", country: "GB", order: 0, races: [value] }];
}
