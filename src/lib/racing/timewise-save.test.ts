import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  createRecord,
  loadTrackerData,
  saveTrackerRace,
} from "../../../scripts/diagnose-tpr-vs-timewise-forward";
import {
  saveTimewiseComparison,
  type TimewiseSaveContext,
  type TimewiseSaveTiming,
} from "./timewise-save";

describe("Timewise save", () => {
  const directories: string[] = [];
  afterEach(async () => Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  ));

  async function fixturePath() {
    const directory = await mkdtemp(join(tmpdir(), "timewise-save-"));
    directories.push(directory);
    return join(directory, "tracker.json");
  }

  test("returns the canonical saved state and detailed persistence timing", async () => {
    const trackerPath = await fixturePath();
    const timings: TimewiseSaveTiming[] = [];
    const result = await saveTimewiseComparison({
      context: context("14:00"),
      formData: formData("race-14:00", "alpha", "bravo"),
      trackerPath,
      recordedAt: new Date("2026-09-21T10:00:00.000Z"),
      onTiming: (value) => { timings.push(value); },
    });

    assert.equal(result.status, "saved");
    assert.equal(result.timewiseRank1, "Alpha");
    assert.equal(result.timewiseRank2, "Bravo");
    assert.equal(result.timewiseRecordedPreRace, true);
    const timing = timings[0];
    assert.ok(timing);
    assert.equal(timing.revalidationMs, 0);
    for (const value of Object.values(timing)) assert.ok(value >= 0);
  });

  test("repeat save is idempotent and preserves recordedAt and recordedPreRace", async () => {
    const trackerPath = await fixturePath();
    const first = await saveTimewiseComparison({
      context: context("14:00"),
      formData: formData("race-14:00", "alpha", "bravo"),
      trackerPath,
      recordedAt: new Date("2026-09-21T10:00:00.000Z"),
    });
    const second = await saveTimewiseComparison({
      context: context("14:00"),
      formData: formData("race-14:00", "alpha", "bravo"),
      trackerPath,
      recordedAt: new Date("2026-09-21T10:05:00.000Z"),
    });
    const stored = await loadTrackerData(trackerPath);

    assert.equal(stored.races.length, 1);
    assert.equal(second.timewiseRecordedAt, first.timewiseRecordedAt);
    assert.equal(second.timewiseRecordedPreRace, first.timewiseRecordedPreRace);
    assert.equal(second.timewiseUpdatedAt, "2026-09-21T10:05:00.000Z");
  });

  test("three immediate sequential saves preserve every race", async () => {
    const trackerPath = await fixturePath();
    for (const time of ["14:00", "15:00", "16:00"]) {
      await saveTimewiseComparison({
        context: context(time),
        formData: formData(`race-${time}`, "alpha", "bravo"),
        trackerPath,
      });
    }

    const stored = await loadTrackerData(trackerPath);
    assert.deepEqual(stored.races.map((race) => race.raceTime), ["14:00", "15:00", "16:00"]);
  });

  test("preserves genuine settlement written after the page context was rendered", async () => {
    const trackerPath = await fixturePath();
    const staleContext = context("14:00");
    await saveTrackerRace(createRecord({
      ...staleContext.forwardInput,
      winner: "Charlie",
      winnerSp: 6,
      winners: [{ horseName: "Charlie", decimalOdds: 6 }],
      winnerOrRank: 2,
      timewiseRank1: "Alpha",
      timewiseRank2: "Bravo",
      timewiseRecordedAt: "2026-09-21T10:00:00.000Z",
      timewiseRecordedPreRace: true,
    }), true, trackerPath);

    await saveTimewiseComparison({
      context: staleContext,
      formData: formData("race-14:00", "bravo", "alpha"),
      trackerPath,
      recordedAt: new Date("2026-09-21T15:00:00.000Z"),
    });
    const record = (await loadTrackerData(trackerPath)).races[0]!;

    assert.equal(record.winner, "Charlie");
    assert.deepEqual(record.winners, [{ horseName: "Charlie", decimalOdds: 6 }]);
    assert.equal(record.winnerOrRank, 2);
    assert.equal(record.timewiseRank1, "Bravo");
  });
});

function context(raceTime: string): TimewiseSaveContext {
  return {
    raceDate: "2026-09-21",
    raceId: `race-${raceTime}`,
    raceDateTime: `2026-09-21T${raceTime}:00.000Z`,
    runners: [
      { runnerId: "alpha", horseName: "Alpha" },
      { runnerId: "bravo", horseName: "Bravo" },
      { runnerId: "charlie", horseName: "Charlie" },
    ],
    forwardInput: {
      family: "turf",
      raceDate: "2026-09-21",
      course: "Newbury",
      raceTime,
      winner: null,
      winnerSp: null,
      winners: [],
      tprRank1: "Alpha",
      tprRank2: "Bravo",
      timewiseRank1: null,
      timewiseRank2: null,
      w50Rank1: "Alpha",
      orRank1: "Alpha",
      winnerOrRank: null,
    },
  };
}

function formData(raceId: string, rank1: string, rank2: string) {
  const value = new FormData();
  value.set("raceDate", "2026-09-21");
  value.set("raceId", raceId);
  value.set("timewiseRank1RunnerId", rank1);
  value.set("timewiseRank2RunnerId", rank2);
  return value;
}
