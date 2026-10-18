import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { calculateHistoricalFormFlags, type HistoricalFormRun, type HistoricalFormTarget } from "./historical-form-flags";

const target = (patch: Partial<HistoricalFormTarget> = {}): HistoricalFormTarget => ({
  targetRunnerId: "today", targetRaceId: "current-race", horseId: "horse", courseId: "ascot-id",
  courseName: "Ascot", raceDateTime: new Date("2026-10-17T14:00:00Z"), officialRating: 108,
  raceType: "Flat", going: "Good", ...patch,
});
const run = (patch: Partial<HistoricalFormRun> = {}): HistoricalFormRun => ({
  raceId: "prior", horseId: "horse", courseId: "ascot-id", courseName: "Ascot", courseSourceId: "ascot-source-id",
  raceDateTime: new Date("2026-09-01T14:00:00Z"), officialRating: 108,
  finishingPosition: 1, resultStatus: "finished", raceType: "Flat", going: "Good", ...patch,
});
const flags = (runs: HistoricalFormRun[], current = target()) => calculateHistoricalFormFlags([current], runs).get("today")!;

describe("historical form OR flag", () => {
  for (const [rating, expected] of [[83, false], [84, true], [85, true], [86, true], [87, true], [88, true], [89, true], [90, true], [91, false]] as const) {
    test(`today 87 / prior winning OR ${rating}: ${expected}`, () => {
      assert.equal(flags([run({ officialRating: rating })], target({ officialRating: 87 })).lastWinWithin3lbOr, expected);
    });
  }
  test("Brighton Boy: latest Pontefract win off 81 ignores the older Chester win off 86", () => {
    const form = flags([
      run({ raceId: "chester", courseName: "Chester", officialRating: 86, raceDateTime: new Date("2025-09-20T14:05:00Z") }),
      run({ raceId: "pontefract", courseName: "Pontefract", officialRating: 81, raceDateTime: new Date("2026-10-05T13:50:00Z") }),
      run({ raceId: "york", courseName: "York", officialRating: 82, raceDateTime: new Date("2024-09-08T14:00:00Z") }),
      run({ raceId: "thirsk", courseName: "Thirsk", officialRating: 81, raceDateTime: new Date("2026-05-16T14:00:00Z") }),
    ], target({ officialRating: 87 }));
    assert.equal(form.lastWinWithin3lbOr, false);
    assert.equal(form.lastWinningOr, 81);
    assert.equal(form.winningOrDifference, 6);
  });
  test("missing or invalid last-win OR never falls back to an older winning mark", () => {
    for (const officialRating of [null, 0, -1, NaN, Infinity, 86.5]) {
      const form = flags([
        run({ raceId: "older", officialRating: 87 }),
        run({ raceId: "latest", officialRating, raceDateTime: new Date("2026-10-05T13:50:00Z") }),
      ], target({ officialRating: 87 }));
      assert.equal(form.lastWinWithin3lbOr, false);
      assert.equal(form.lastWinningOr, null);
      assert.equal(form.winningOrDifference, null);
    }
  });
  for (const [rating, expected] of [[105, true], [108, true], [111, true], [104, false], [112, false]] as const) {
    test(`today 108 / prior winning OR ${rating}: ${expected}`, () => {
      assert.equal(flags([run({ officialRating: rating })]).lastWinWithin3lbOr, expected);
    });
  }
  test("selects the most recent winning time regardless of input order or later non-wins", () => {
    const older = run({ raceId: "older", officialRating: 81, raceDateTime: new Date("2026-10-05T13:00:00Z") });
    const latest = run({ raceId: "latest", officialRating: 86, raceDateTime: new Date("2026-10-05T14:00:00Z") });
    const second = run({ raceId: "second", finishingPosition: 2, officialRating: 81, raceDateTime: new Date("2026-10-06T14:00:00Z") });
    for (const history of [[older, latest, second], [second, latest, older]]) {
      const form = flags(history, target({ officialRating: 87 }));
      assert.equal(form.lastWinWithin3lbOr, true);
      assert.equal(form.lastWinningOr, 86);
      assert.equal(form.winningOrDifference, 1);
    }
  });
  test("an incompatible last winning code does not fall back to an older matching code", () => {
    const form = flags([
      run(),
      run({ raceId: "latest", raceType: "Hurdle", raceDateTime: new Date("2026-10-05T14:00:00Z") }),
    ]);
    assert.equal(form.lastWinWithin3lbOr, false);
  });
  test("current and future wins cannot displace the last prior win", () => {
    const form = flags([
      run({ raceId: "older", officialRating: 86 }),
      run({ raceId: "latest", officialRating: 81, raceDateTime: new Date("2026-10-05T14:00:00Z") }),
      run({ raceId: "current-race", officialRating: 87 }),
      run({ raceId: "current-race", officialRating: 87 }),
      run({ raceId: "same-time", officialRating: 87, raceDateTime: target().raceDateTime }),
      run({ raceId: "future", officialRating: 87, raceDateTime: new Date("2026-10-18T14:00:00Z") }),
    ], target({ officialRating: 87 }));
    assert.equal(form.lastWinWithin3lbOr, false);
    assert.equal(form.lastWinningOr, 81);
    assert.equal(form.winningOrDifference, 6);
  });
  test("a second is not a winning mark", () => assert.equal(flags([run({ finishingPosition: 2 })]).lastWinWithin3lbOr, false));
  test("missing and invalid historical ORs are ignored", () => {
    for (const officialRating of [null, 0, -1, NaN, Infinity]) assert.equal(flags([run({ officialRating })]).lastWinWithin3lbOr, false);
  });
  test("missing current OR hides OR flag independently of course evidence", () => {
    const form = flags([run()], target({ officialRating: null }));
    assert.equal(form.lastWinWithin3lbOr, false);
    assert.equal(form.courseFirstOrSecond, true);
  });
  test("Flat marks can cross Turf/AW surfaces", () => assert.equal(flags([run({ going: "Standard", courseName: "Kempton" })]).lastWinWithin3lbOr, true));
  test("Hurdle and Chase marks are kept separate from each other and Flat", () => {
    const hurdle = target({ raceType: "Hurdle" });
    assert.equal(flags([run({ raceType: "Hurdle" })], hurdle).lastWinWithin3lbOr, true);
    assert.equal(flags([run({ raceType: "Chase" })], hurdle).lastWinWithin3lbOr, false);
    assert.equal(flags([run()], hurdle).lastWinWithin3lbOr, false);
    assert.equal(flags([run({ raceType: "Hurdle" })]).lastWinWithin3lbOr, false);
    assert.equal(flags([run({ raceType: "Chase" })], target({ raceType: "Chase" })).lastWinWithin3lbOr, true);
    assert.equal(flags([run({ raceType: "NH Flat" })], target({ raceType: "NH Flat" })).lastWinWithin3lbOr, false);
  });
});

describe("historical course first/second flag", () => {
  for (const [position, expected] of [[1, true], [2, true], [3, false]] as const) {
    test(`prior position ${position}: ${expected}`, () => assert.equal(flags([run({ finishingPosition: position })]).courseFirstOrSecond, expected));
  }
  test("different course is not a match, even when the name is identical", () => assert.equal(flags([run({ courseId: "other-id" })]).courseFirstOrSecond, false));
  test("course display aliases match through their canonical ID", () => assert.equal(flags([run({ courseName: "ASCOT (GB)" })]).courseFirstOrSecond, true));
  test("counts wins and seconds across codes and retains most recent finish", () => {
    const form = flags([run(), run({ raceId: "second", finishingPosition: 2, raceType: "Chase", raceDateTime: new Date("2026-10-01T13:00:00Z") })]);
    assert.equal(form.courseWins, 1); assert.equal(form.courseSeconds, 1);
    assert.deepEqual(form.latestCourseFinish, { position: 2, raceDateTime: "2026-10-01T13:00:00.000Z" });
  });
  test("missing course identity does not produce a course flag", () => assert.equal(flags([run({ courseId: "" })], target({ courseId: "" })).courseFirstOrSecond, false));
});

describe("historical form chronology and identities", () => {
  test("excludes current race IDs, same-time and future results, invalid dates and other horses", () => {
    const form = flags([
      run({ raceId: "current-race" }), run({ raceId: "same-time", raceDateTime: target().raceDateTime }),
      run({ raceId: "future", raceDateTime: new Date("2026-10-18") }),
      run({ raceId: "invalid", raceDateTime: new Date(NaN) }), run({ horseId: "other" }),
    ]);
    assert.equal(form.lastWinWithin3lbOr, false); assert.equal(form.courseFirstOrSecond, false);
  });
  test("void/non-runner results do not qualify", () => {
    for (const resultStatus of ["non_runner", "void", "abandoned", "cancelled"]) {
      const form = flags([run({ resultStatus })]);
      assert.equal(form.lastWinWithin3lbOr, false); assert.equal(form.courseFirstOrSecond, false);
    }
  });
  test("uses each target's cutoff in a batched load", () => {
    const result = calculateHistoricalFormFlags([target(), target({ targetRunnerId: "later", targetRaceId: "later-race", raceDateTime: new Date("2026-10-18") })], [run({ raceDateTime: new Date("2026-10-17T15:00:00Z") })]);
    assert.equal(result.get("today")!.courseFirstOrSecond, false);
    assert.equal(result.get("later")!.courseFirstOrSecond, true);
  });
  test("duplicate prior race records do not inflate course counts", () => assert.equal(flags([run(), run()]).courseWins, 1));
  test("no history produces neither flag", () => {
    const form = flags([]); assert.equal(form.lastWinWithin3lbOr, false); assert.equal(form.courseFirstOrSecond, false);
  });
});
