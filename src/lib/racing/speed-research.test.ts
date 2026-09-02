import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BEATEN_DISTANCE_ASSUMPTIONS,
  beatenLengthsToSeconds,
  classifyRaceCategory,
  equivalentFinishingTimeSeconds,
  median,
  parseBeatenDistanceLengths,
  parseWinningTimeSeconds,
  reconstructCumulativeBeatenLengths,
  sampleLabel,
  secondsPerLength,
  standardDeviation,
} from "./speed-research";

describe("parseWinningTimeSeconds", () => {
  test("parses Sporting Life seconds-only winning times", () => {
    assert.equal(parseWinningTimeSeconds("58.19s"), 58.19);
  });

  test("parses Sporting Life minute and second winning times", () => {
    assert.equal(parseWinningTimeSeconds("1m 29.11s"), 89.11);
    assert.equal(parseWinningTimeSeconds("6m 14.33s"), 374.33);
  });

  test("returns null for missing or unrecognized winning times", () => {
    assert.equal(parseWinningTimeSeconds(null), null);
    assert.equal(parseWinningTimeSeconds("1:29.11"), null);
    assert.equal(parseWinningTimeSeconds("about 58s"), null);
  });
});

describe("parseBeatenDistanceLengths", () => {
  test("parses numeric lengths", () => {
    assert.equal(parseBeatenDistanceLengths("1"), 1);
    assert.equal(parseBeatenDistanceLengths("12"), 12);
    assert.equal(parseBeatenDistanceLengths("1.5"), 1.5);
  });

  test("parses standalone fractions", () => {
    assert.equal(parseBeatenDistanceLengths("¼"), 0.25);
    assert.equal(parseBeatenDistanceLengths("½"), 0.5);
    assert.equal(parseBeatenDistanceLengths("¾"), 0.75);
  });

  test("parses mixed whole-number and fraction lengths", () => {
    assert.equal(parseBeatenDistanceLengths("1 ¼"), 1.25);
    assert.equal(parseBeatenDistanceLengths("2 ½"), 2.5);
    assert.equal(parseBeatenDistanceLengths("3 ¾"), 3.75);
  });

  test("uses centralized provisional short-margin assumptions", () => {
    assert.equal(parseBeatenDistanceLengths("nse"), BEATEN_DISTANCE_ASSUMPTIONS.nse);
    assert.equal(parseBeatenDistanceLengths("sh"), BEATEN_DISTANCE_ASSUMPTIONS.sh);
    assert.equal(parseBeatenDistanceLengths("hd"), BEATEN_DISTANCE_ASSUMPTIONS.hd);
    assert.equal(parseBeatenDistanceLengths("nk"), BEATEN_DISTANCE_ASSUMPTIONS.nk);
    assert.equal(parseBeatenDistanceLengths("dh"), 0);
  });

  test("returns null for missing or unknown notation", () => {
    assert.equal(parseBeatenDistanceLengths(null), null);
    assert.equal(parseBeatenDistanceLengths(""), null);
    assert.equal(parseBeatenDistanceLengths("dist"), null);
  });
});

describe("research statistics", () => {
  test("calculates median and sample standard deviation", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(standardDeviation([1, 2, 3])?.toFixed(3), "1.000");
  });

  test("labels sample-size strength descriptively", () => {
    assert.equal(sampleLabel(1), "insufficient");
    assert.equal(sampleLabel(2), "very weak");
    assert.equal(sampleLabel(4), "weak");
    assert.equal(sampleLabel(5), "preliminary");
  });
});

describe("seconds-per-length conversion", () => {
  test("uses a fixed conversion when requested", () => {
    assert.equal(secondsPerLength("fixed"), 0.2);
    assert.equal(beatenLengthsToSeconds(5, "fixed"), 1);
  });

  test("uses representative distance-band conversions", () => {
    assert.equal(secondsPerLength("distance_band", { distanceYards: 1100 }), 0.18);
    assert.equal(secondsPerLength("distance_band", { distanceYards: 1540 }), 0.19);
    assert.equal(secondsPerLength("distance_band", { distanceYards: 2200 }), 0.2);
    assert.equal(secondsPerLength("distance_band", { distanceYards: 3000 }), 0.22);
  });

  test("uses a wider jumps assumption when the context is jumps", () => {
    assert.equal(secondsPerLength("distance_band", { raceCategory: "jumps", distanceYards: 3900 }), 0.25);
    assert.equal(secondsPerLength("race_category", { raceCategory: "jumps" }), 0.25);
  });

  test("calculates speed-based conversion from race speed", () => {
    assert.equal(
      secondsPerLength("speed_based", { distanceYards: 1320, winnerTimeSeconds: 72 }).toFixed(3),
      "0.145",
    );
  });

  test("estimates equivalent finishing time from winner time and cumulative lengths", () => {
    assert.equal(equivalentFinishingTimeSeconds(72, 3, "fixed"), 72.6);
  });
});

describe("race category classification", () => {
  test("classifies representative sprint, middle-distance, all-weather and jumps contexts", () => {
    assert.equal(classifyRaceCategory({ distanceYards: 1100, surface: "TURF" }), "flat");
    assert.equal(classifyRaceCategory({ distanceYards: 2200, surface: "TURF" }), "flat");
    assert.equal(classifyRaceCategory({ distanceYards: 1576, surface: "ALLWEATHER" }), "all_weather");
    assert.equal(classifyRaceCategory({ raceType: "hurdle", distanceYards: 3902, surface: "TURF" }), "jumps");
    assert.equal(
      classifyRaceCategory({
        distanceYards: 3520,
        raceName: "Royal Sussex Regiment Handicap",
        raceType: "handicap",
        surface: "TURF",
      }),
      "flat",
    );
    assert.equal(
      classifyRaceCategory({
        distanceYards: 3567,
        raceName: "Lodge At Perth Racecourse Standard Open NH Flat Race",
        surface: "TURF",
      }),
      "jumps",
    );
  });
});

describe("reconstructCumulativeBeatenLengths", () => {
  test("reconstructs cumulative lengths from adjacent Sporting Life margins", () => {
    const rows = reconstructCumulativeBeatenLengths([
      { id: "winner", finishingPosition: 1, resultStatus: "finished", beatenDistance: null },
      { id: "second", finishingPosition: 2, resultStatus: "finished", beatenDistance: "1 ¼" },
      { id: "third", finishingPosition: 3, resultStatus: "finished", beatenDistance: "½" },
      { id: "fourth", finishingPosition: 4, resultStatus: "finished", beatenDistance: "nk" },
    ]);

    assert.equal(rows.find((row) => row.id === "winner")?.cumulativeBeatenLengths, 0);
    assert.equal(rows.find((row) => row.id === "second")?.cumulativeBeatenLengths, 1.25);
    assert.equal(rows.find((row) => row.id === "third")?.cumulativeBeatenLengths, 1.75);
    assert.equal(rows.find((row) => row.id === "fourth")?.cumulativeBeatenLengths, 2.05);
  });

  test("keeps dead-heated runners level with the preceding finisher", () => {
    const rows = reconstructCumulativeBeatenLengths([
      { id: "winner", finishingPosition: 1, resultStatus: "finished", beatenDistance: null },
      { id: "second", finishingPosition: 2, resultStatus: "finished", beatenDistance: "2" },
      { id: "third", finishingPosition: 3, resultStatus: "finished", beatenDistance: "sh" },
      { id: "dead-heat", finishingPosition: 4, resultStatus: "finished", beatenDistance: "dh" },
      { id: "next", finishingPosition: 5, resultStatus: "finished", beatenDistance: "1" },
    ]);

    assert.equal(rows.find((row) => row.id === "third")?.cumulativeBeatenLengths, 2.1);
    assert.equal(rows.find((row) => row.id === "dead-heat")?.cumulativeBeatenLengths, 2.1);
    assert.equal(rows.find((row) => row.id === "next")?.cumulativeBeatenLengths, 3.1);
  });

  test("does not assign synthetic times to non-finishers or non-runners", () => {
    const rows = reconstructCumulativeBeatenLengths([
      { id: "winner", finishingPosition: 1, resultStatus: "finished", beatenDistance: null },
      { id: "second", finishingPosition: 2, resultStatus: "finished", beatenDistance: "1" },
      { id: "pulled-up", finishingPosition: null, resultStatus: "pulled_up", beatenDistance: null },
      { id: "non-runner", finishingPosition: null, resultStatus: "non_runner", beatenDistance: null },
    ]);

    assert.equal(rows.find((row) => row.id === "pulled-up")?.cumulativeBeatenLengths, null);
    assert.equal(rows.find((row) => row.id === "non-runner")?.cumulativeBeatenLengths, null);
    assert.equal(equivalentFinishingTimeSeconds(90, null, "fixed"), null);
  });

  test("marks reconstruction ambiguous after an unparseable finished-runner margin", () => {
    const rows = reconstructCumulativeBeatenLengths([
      { id: "winner", finishingPosition: 1, resultStatus: "finished", beatenDistance: null },
      { id: "second", finishingPosition: 2, resultStatus: "finished", beatenDistance: "dist" },
      { id: "third", finishingPosition: 3, resultStatus: "finished", beatenDistance: "1" },
    ]);

    assert.equal(rows.find((row) => row.id === "second")?.cumulativeBeatenLengths, null);
    assert.equal(rows.find((row) => row.id === "second")?.ambiguous, true);
    assert.equal(rows.find((row) => row.id === "third")?.cumulativeBeatenLengths, null);
  });

  test("produces monotonic equivalent times for finished runners", () => {
    const rows = reconstructCumulativeBeatenLengths([
      { id: "winner", finishingPosition: 1, resultStatus: "finished", beatenDistance: null },
      { id: "second", finishingPosition: 2, resultStatus: "finished", beatenDistance: "hd" },
      { id: "third", finishingPosition: 3, resultStatus: "finished", beatenDistance: "¾" },
    ]);
    const times = rows.map((row) =>
      equivalentFinishingTimeSeconds(58.19, row.cumulativeBeatenLengths, "distance_band", {
        distanceYards: 1100,
      }),
    );

    assert.equal(times[0], 58.19);
    assert.ok(times[1] !== null && times[1] > 58.19);
    assert.ok(times[2] !== null && times[1] !== null && times[2] > times[1]);
  });
});
