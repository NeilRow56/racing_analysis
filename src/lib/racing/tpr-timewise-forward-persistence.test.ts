import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  createRecord,
  loadTrackerData,
  mutateTrackerData,
  saveTrackerRace,
  upsertRace,
  type ForwardRaceRecord,
} from "../../../scripts/diagnose-tpr-vs-timewise-forward";
import { enrichTodayForwardTrackerResults } from "./tpr-timewise-forward-settlement";
import type { TodayMeeting, TodayRace } from "./todays-racing";

describe("Timewise tracker persistence", () => {
  const directories: string[] = [];
  afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

  async function fixturePath() {
    const directory = await mkdtemp(join(tmpdir(), "timewise-tracker-"));
    directories.push(directory);
    return join(directory, "tracker.json");
  }

  test("keeps two concurrent manual saves to different races without duplicates", async () => {
    const path = await fixturePath();
    await Promise.all([
      saveTrackerRace(record("14:00", "Alpha"), true, path),
      saveTrackerRace(record("15:00", "Bravo"), true, path),
    ]);
    const data = await loadTrackerData(path);
    assert.deepEqual(data.races.map((race) => race.raceTime), ["14:00", "15:00"]);
    assert.equal(new Set(data.races.map((race) => race.raceTime)).size, 2);
  });

  test("preserves a concurrent manual save when settlement enriches latest data", async () => {
    const path = await fixturePath();
    await saveTrackerRace(record("14:00", "Alpha"), true, path);
    const manual = record("15:00", "Charlie");
    await Promise.all([
      mutateTrackerData(async (latest) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return upsertRace(latest, manual, true);
      }, path),
      enrichTodayForwardTrackerResults([meeting(settledRace("14:00", "Alpha"))], "2026-09-19", undefined, path),
    ]);
    const data = await loadTrackerData(path);
    assert.equal(data.races.length, 2);
    assert.equal(data.races.find((race) => race.raceTime === "14:00")?.winner, "Alpha");
    assert.equal(data.races.find((race) => race.raceTime === "15:00")?.timewiseRank1, "Charlie");
  });

  test("keeps both concurrent settlement updates", async () => {
    const path = await fixturePath();
    await Promise.all([
      saveTrackerRace(record("14:00", "Alpha"), true, path),
      saveTrackerRace(record("15:00", "Bravo"), true, path),
    ]);
    await Promise.all([
      enrichTodayForwardTrackerResults([meeting(settledRace("14:00", "Alpha"))], "2026-09-19", undefined, path),
      enrichTodayForwardTrackerResults([meeting(settledRace("15:00", "Bravo"))], "2026-09-19", undefined, path),
    ]);
    const data = await loadTrackerData(path);
    assert.deepEqual(data.races.map((race) => race.winner), ["Alpha", "Bravo"]);
  });

  test("repeated replacement is idempotent and keeps audit metadata", async () => {
    const path = await fixturePath();
    const value = record("14:00", "Alpha");
    await Promise.all([
      saveTrackerRace(value, true, path),
      saveTrackerRace(value, true, path),
      saveTrackerRace(value, true, path),
    ]);
    const data = await loadTrackerData(path);
    assert.equal(data.races.length, 1);
    assert.equal(data.races[0]?.timewiseRecordedAt, value.timewiseRecordedAt);
    assert.equal(data.races[0]?.timewiseRecordedPreRace, true);
  });
});

function record(raceTime: string, timewiseRank1: string): ForwardRaceRecord {
  return createRecord({
    family: "turf",
    raceDate: "2026-09-19",
    course: "Newbury",
    raceTime,
    winner: null,
    winnerSp: null,
    tprRank1: "Alpha",
    tprRank2: "Bravo",
    timewiseRank1,
    timewiseRank2: timewiseRank1 === "Alpha" ? "Bravo" : "Alpha",
    w50Rank1: "Alpha",
    orRank1: "Alpha",
    winnerOrRank: null,
    timewiseRecordedAt: "2026-09-19T10:00:00.000Z",
    timewiseRecordedPreRace: true,
    timewiseUpdatedAt: null,
  });
}

function meeting(race: TodayRace): TodayMeeting {
  return {
    courseId: "newbury",
    courseSourceId: "newbury-source",
    courseName: "Newbury",
    country: "ENG",
    order: 1,
    races: [race],
  };
}

function settledRace(time: string, winner: string): TodayRace {
  const runners = ["Alpha", "Bravo", "Charlie"].map((horseName, index) => ({
    runnerId: `runner-${index}`,
    horseName,
    resultStatus: "runner" as const,
    finishingPosition: horseName === winner ? 1 : index + 2,
    oddsDecimal: horseName === winner ? "5" : "3",
    officialRating: 90 - index,
  }));
  return {
    raceId: `race-${time}`,
    scheduledTime: `${time}:00`,
    raceDateTime: new Date(`2026-09-19T${time}:00Z`),
    raceType: "Flat",
    raceTypeCode: "FLAT",
    surface: "TURF",
    going: "Good",
    runners,
  } as TodayRace;
}
