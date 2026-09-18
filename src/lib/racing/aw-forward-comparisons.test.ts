import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AW_COMPARISONS,
  AW_FORWARD_VERSION,
  bestL3SpeedRanks,
  buildAwForwardRecords,
  comparisonIdsFor,
  settleAwForwardRecords,
  summarizeAwForward,
  upsertAwForwardRecords,
  type AwForwardData,
  type AwForwardRecord,
} from "./aw-forward-comparisons";
import type { TodayMeeting, TodayRunner } from "./todays-racing";

describe("AW forward comparisons", () => {
  test("freezes the seven requested definitions", () => {
    assert.deepEqual(AW_COMPARISONS.map(({ course, distance, drawMin, ...definition }) => ({ course, distance, drawMin, ...definition })), [
      { id: "wolverhampton_sprint_draw_1_3", label: "Wolverhampton sprint - Draw 1-3", course: "Wolverhampton", distance: "sprint", drawMin: 1, drawMax: 3 },
      { id: "wolverhampton_sprint_draw_1_3_speed_rank_1", label: "Wolverhampton sprint - Draw 1-3 + Best L3 Speed rank 1", course: "Wolverhampton", distance: "sprint", drawMin: 1, drawMax: 3, speedRankMax: 1 },
      { id: "wolverhampton_sprint_draw_1_3_speed_top_2", label: "Wolverhampton sprint - Draw 1-3 + Best L3 Speed top 2", course: "Wolverhampton", distance: "sprint", drawMin: 1, drawMax: 3, speedRankMax: 2 },
      { id: "wolverhampton_sprint_draw_7_plus", label: "Wolverhampton sprint - Draw 7+", course: "Wolverhampton", distance: "sprint", drawMin: 7 },
      { id: "newcastle_middle_distance_low_draw", label: "Newcastle middle distance - low draw", course: "Newcastle", distance: "middle distance", drawMin: 1, drawMax: 3 },
      { id: "kempton_middle_distance_low_draw", label: "Kempton middle distance - low draw", course: "Kempton", distance: "middle distance", drawMin: 1, drawMax: 3 },
      { id: "southwell_staying_low_draw", label: "Southwell staying - low draw", course: "Southwell", distance: "staying", drawMin: 1, drawMax: 3 },
    ]);
  });

  test("uses competition speed ranks and exact draw qualification", () => {
    const ranks = bestL3SpeedRanks([runner("a", 1, 100), runner("b", 2, 100), runner("c", 7, 90)]);
    assert.deepEqual([...ranks.entries()], [["a", 1], ["b", 1], ["c", 3]]);
    assert.deepEqual(comparisonIdsFor({ course: "Wolverhampton", distanceYards: 1320, draw: 1, bestL3SpeedRank: 1 }), [
      "wolverhampton_sprint_draw_1_3",
      "wolverhampton_sprint_draw_1_3_speed_rank_1",
      "wolverhampton_sprint_draw_1_3_speed_top_2",
    ]);
    assert.deepEqual(comparisonIdsFor({ course: "Wolverhampton", distanceYards: 1320, draw: 7, bestL3SpeedRank: 3 }), ["wolverhampton_sprint_draw_7_plus"]);
  });

  test("captures only forward pre-race runners and does not duplicate them", () => {
    const meetings = [meeting()];
    const before = new Date("2026-09-18T17:00:00.000Z");
    const records = buildAwForwardRecords(meetings, "2026-09-18", before);
    assert.equal(records.length, 3);
    assert.ok(records.every((record) => record.recordedPreRace));
    assert.deepEqual(buildAwForwardRecords(meetings, "2026-09-18", new Date("2026-09-18T19:00:00.000Z")), []);
    assert.deepEqual(buildAwForwardRecords(meetings, "2026-09-17", before), []);
    const once = upsertAwForwardRecords(empty(), records);
    assert.deepEqual(upsertAwForwardRecords(once, records), once);
    const postRace = { ...records[0]!, recordedAt: "2026-09-18T19:00:00.000Z", recordedPreRace: false };
    assert.equal(upsertAwForwardRecords({ ...empty(), records: [postRace] }, [records[0]!]).records[0]!.recordedPreRace, false);
  });

  test("settlement is idempotent and preserves qualification fields", () => {
    const initial = upsertAwForwardRecords(empty(), buildAwForwardRecords([meeting()], "2026-09-18", new Date("2026-09-18T17:00:00.000Z")));
    const settledMeeting = meeting([
      runner("a", 1, 100, 1, "6.00"),
      runner("b", 2, 90, 2, "3.00"),
      runner("c", 7, 80, 3, "10.00"),
    ]);
    const settled = settleAwForwardRecords(initial, [settledMeeting], new Date("2026-09-18T20:00:00.000Z"));
    const repeated = settleAwForwardRecords(settled, [settledMeeting], new Date("2026-09-18T20:00:00.000Z"));
    assert.deepEqual(repeated, settled);
    assert.deepEqual(settled.records[0]!.comparisonIds, initial.records[0]!.comparisonIds);
    assert.equal(settled.records[0]!.uncappedReturn, 6);
    assert.equal(settled.records[1]!.uncappedReturn, 0);
  });

  test("keeps pending records and excludes post-race records from clean summaries", () => {
    const clean = record({ key: "race|clean", runnerKey: "clean", finalSp: 6, uncappedReturn: 6, capped20Return: 6, won: true, finishingPosition: 1 });
    const pending = record({ key: "race|pending", runnerKey: "pending" });
    const backfilled = record({ key: "old|backfill", raceKey: "old", runnerKey: "backfill", recordedPreRace: false, finalSp: 10, uncappedReturn: 10, capped20Return: 10, won: true, finishingPosition: 1 });
    const data: AwForwardData = { version: AW_FORWARD_VERSION, records: [clean, pending, backfilled] };
    const summary = summarizeAwForward(data)[0]!;
    assert.deepEqual({ races: summary.races, selections: summary.selections, pending: summary.pending, settled: summary.settled, winners: summary.winners, strike: summary.strike, uncappedRoi: summary.uncappedRoi, ae: summary.ae, averageWinningSp: summary.averageWinningSp }, { races: 1, selections: 2, pending: 1, settled: 1, winners: 1, strike: 1, uncappedRoi: 5, ae: 6, averageWinningSp: 6 });
    assert.equal(summarizeAwForward(data, false)[0]!.selections, 1);
  });
});

function empty(): AwForwardData { return { version: AW_FORWARD_VERSION, records: [] }; }

function runner(id: string, draw: number, speed: number, finishingPosition: number | null = null, oddsDecimal: string | null = null): TodayRunner {
  return {
    runnerId: id, runnerSourceId: id, horseId: id, horseName: `Horse ${id}`, saddleclothNumber: draw,
    horseAge: 4, horseSex: null, weight: null, weightCarriedLbs: null, draw, jockeyName: null,
    trainerId: null, trainerName: null, officialRating: null, odds: null, oddsDecimal,
    resultStatus: finishingPosition === null ? null : "runner", finishingPosition,
    metrics: { bestAwSpeedLast3: speed } as TodayRunner["metrics"],
  };
}

function meeting(runners = [runner("a", 1, 100), runner("b", 2, 90), runner("c", 7, 80)]): TodayMeeting {
  return {
    courseId: "wolves", courseSourceId: "wolves", courseName: "Wolverhampton", country: "GB", order: 1,
    races: [{
      raceId: "race", sourceId: "race", scheduledTime: "18:00", raceDateTime: new Date("2026-09-18T18:00:00.000Z"),
      courseCountry: "GB", raceName: "Handicap", raceClass: "5", raceType: "Flat", raceTypeCode: "flat",
      distance: "6f", distanceYards: 1320, going: "Standard", surface: "ALLWEATHER", declaredRunnerCount: 3,
      actualRunnerCount: 3, winningTime: null, runners,
    }],
  };
}

function record(overrides: Partial<AwForwardRecord>): AwForwardRecord {
  return {
    key: "race|runner", raceKey: "race", runnerKey: "runner", raceDate: "2026-09-18", course: "Wolverhampton",
    raceTime: "18:00", scheduledAt: "2026-09-18T18:00:00.000Z", distanceYards: 1320, fieldSize: 8, draw: 1,
    horse: "Horse", bestL3Speed: 100, bestL3SpeedRank: 1, comparisonIds: ["wolverhampton_sprint_draw_1_3"],
    recordedAt: "2026-09-18T17:00:00.000Z", recordedPreRace: true, finishingPosition: null, won: null,
    finalSp: null, capped20Return: null, uncappedReturn: null, settledAt: null, ...overrides,
  };
}
