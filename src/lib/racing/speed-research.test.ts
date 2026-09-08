import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  BEATEN_DISTANCE_ASSUMPTIONS,
  RESEARCH_MEETING_VARIANT_ASSUMPTIONS,
  absoluteTimingErrorSeconds,
  beatenLengthsToSeconds,
  classifyRaceCategory,
  deviationPerFurlong,
  distanceYardsToFurlongs,
  equivalentFinishingTimeSeconds,
  goingAdjustedStandardSeconds,
  leaveOneOutMeetingVariant,
  leaveOneOutStandardTime,
  median,
  parseBeatenDistanceLengths,
  parseWinningTimeSeconds,
  provisionalSpeedFigure,
  reconstructCumulativeBeatenLengths,
  researchMeetingVariantFromDeviations,
  sampleLabel,
  sanityCheckWinningTime,
  secondsPerLength,
  timeDifferenceToSpeedPoints,
  standardDeviation,
  variantAdjustedTimeSeconds,
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

describe("sanityCheckWinningTime", () => {
  test("rejects physically impossible winning times", () => {
    const result = sanityCheckWinningTime({
      winningTime: "0.01s",
      distanceYards: 2200,
    });

    assert.equal(result.parsedSeconds, 0.01);
    assert.equal(result.usableSeconds, null);
    assert.equal(result.reason, "physically_implausible");
  });

  test("accepts normal sprint, middle-distance and jumps winning times", () => {
    assert.equal(
      sanityCheckWinningTime({ winningTime: "58.19s", distanceYards: 1100 }).usableSeconds,
      58.19,
    );
    assert.equal(
      sanityCheckWinningTime({ winningTime: "2m 8.50s", distanceYards: 2200 }).usableSeconds,
      128.5,
    );
    assert.equal(
      sanityCheckWinningTime({ winningTime: "6m 14.33s", distanceYards: 3520 }).usableSeconds,
      374.33,
    );
  });

  test("keeps missing and unparseable winning times excluded", () => {
    assert.deepEqual(sanityCheckWinningTime({ winningTime: null, distanceYards: 1100 }), {
      parsedSeconds: null,
      usableSeconds: null,
      impliedAverageSpeedYardsPerSecond: null,
      reason: "missing",
    });
    assert.equal(
      sanityCheckWinningTime({ winningTime: "about 58s", distanceYards: 1100 }).reason,
      "unparseable",
    );
  });

  test("returns parsed source value separately from usable research value", () => {
    const result = sanityCheckWinningTime({
      winningTime: "0.01s",
      distanceYards: 1540,
    });

    assert.equal(result.parsedSeconds, 0.01);
    assert.equal(result.usableSeconds, null);
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

describe("provisional speed figures", () => {
  const standardRaceInputs = [
    { raceId: "target", groupKey: "course:1100", meetingKey: "day-a", winningTimeSeconds: 60 },
    { raceId: "peer-a", groupKey: "course:1100", meetingKey: "day-a", winningTimeSeconds: 62 },
    { raceId: "peer-b", groupKey: "course:1100", meetingKey: "day-a", winningTimeSeconds: 64 },
    { raceId: "other", groupKey: "course:1320", meetingKey: "day-a", winningTimeSeconds: 75 },
    { raceId: "other-peer-a", groupKey: "course:1320", meetingKey: "day-b", winningTimeSeconds: 73 },
    { raceId: "other-peer-b", groupKey: "course:1320", meetingKey: "day-c", winningTimeSeconds: 74 },
  ];

  test("excludes the target race from its own standard", () => {
    const standard = leaveOneOutStandardTime("target", standardRaceInputs);

    assert.equal(standard.standardSeconds, 63);
    assert.equal(standard.sampleSize, 2);
  });

  test("returns unavailable standard when no comparison races exist", () => {
    const standard = leaveOneOutStandardTime("solo", [
      { raceId: "solo", groupKey: "course:1540", meetingKey: "day", winningTimeSeconds: 88 },
    ]);

    assert.equal(standard.standardSeconds, null);
    assert.equal(standard.confidence, "insufficient");
  });

  test("uses the correct meeting-variant sign", () => {
    const variant = leaveOneOutMeetingVariant(
      "target",
      [
        { raceId: "target", groupKey: "course:1100", meetingKey: "day-a", winningTimeSeconds: 60 },
        { raceId: "peer-a", groupKey: "course:1320", meetingKey: "day-a", winningTimeSeconds: 75 },
        { raceId: "peer-a-standard", groupKey: "course:1320", meetingKey: "day-b", winningTimeSeconds: 74 },
        { raceId: "peer-b", groupKey: "course:1540", meetingKey: "day-a", winningTimeSeconds: 86 },
        { raceId: "peer-b-standard", groupKey: "course:1540", meetingKey: "day-b", winningTimeSeconds: 85 },
      ],
      1,
      1,
    );

    assert.equal(variant.variantSeconds, 1);
  });

  test("research baseline median variant matches the existing baseline calculation", () => {
    const variant = leaveOneOutMeetingVariant(
      "target",
      [
        { raceId: "target", groupKey: "course:1100", meetingKey: "day-a", winningTimeSeconds: 60 },
        { raceId: "peer-a", groupKey: "course:1320", meetingKey: "day-a", winningTimeSeconds: 75 },
        { raceId: "peer-a-standard", groupKey: "course:1320", meetingKey: "day-b", winningTimeSeconds: 74 },
        { raceId: "peer-b", groupKey: "course:1540", meetingKey: "day-a", winningTimeSeconds: 86 },
        { raceId: "peer-b-standard", groupKey: "course:1540", meetingKey: "day-b", winningTimeSeconds: 85 },
      ],
      1,
      1,
    );
    const researchVariant = researchMeetingVariantFromDeviations({
      deviations: variant.deviations,
      method: "baseline_median",
      minimumVariantSampleSize: 1,
    });

    assert.equal(researchVariant.variantSeconds, variant.variantSeconds);
    assert.deepEqual(researchVariant.adjustedDeviations, variant.deviations);
  });

  test("bounded median winsorizes individual race deviations before taking the median", () => {
    const variant = researchMeetingVariantFromDeviations({
      deviations: [-100, 1, 2, 3, 100],
      method: "bounded_median",
      minimumVariantSampleSize: 2,
    });

    assert.deepEqual(variant.adjustedDeviations, [
      -RESEARCH_MEETING_VARIANT_ASSUMPTIONS.boundedDeviationSeconds,
      1,
      2,
      3,
      RESEARCH_MEETING_VARIANT_ASSUMPTIONS.boundedDeviationSeconds,
    ]);
    assert.equal(variant.variantSeconds, 2);
  });

  test("trimmed mean removes symmetric tails when enough races contribute", () => {
    const variant = researchMeetingVariantFromDeviations({
      deviations: [-50, 1, 2, 3, 100],
      method: "trimmed_mean",
      minimumVariantSampleSize: 2,
    });

    assert.deepEqual(variant.adjustedDeviations, [1, 2, 3]);
    assert.equal(variant.variantSeconds, 2);
  });

  test("robust variants return null when the sample is insufficient", () => {
    const bounded = researchMeetingVariantFromDeviations({
      deviations: [1, 2],
      method: "bounded_median",
      minimumVariantSampleSize: 3,
    });
    const trimmed = researchMeetingVariantFromDeviations({
      deviations: [-100, 1, 2, 3, 100],
      method: "trimmed_mean",
      minimumVariantSampleSize: 4,
    });

    assert.equal(bounded.variantSeconds, null);
    assert.equal(trimmed.variantSeconds, null);
  });

  test("extreme single-race deviations do not dominate robust methods unexpectedly", () => {
    const bounded = researchMeetingVariantFromDeviations({
      deviations: [0, 1, 2, 3, 100],
      method: "bounded_median",
      minimumVariantSampleSize: 2,
    });
    const trimmed = researchMeetingVariantFromDeviations({
      deviations: [0, 1, 2, 3, 100],
      method: "trimmed_mean",
      minimumVariantSampleSize: 2,
    });

    assert.equal(bounded.variantSeconds, 2);
    assert.equal(trimmed.variantSeconds, 2);
  });

  test("stable meetings stay close to baseline under robust alternatives", () => {
    const deviations = [-1, 0, 1, 2, 3];
    const baseline = researchMeetingVariantFromDeviations({
      deviations,
      method: "baseline_median",
    });
    const bounded = researchMeetingVariantFromDeviations({
      deviations,
      method: "bounded_median",
    });
    const trimmed = researchMeetingVariantFromDeviations({
      deviations,
      method: "trimmed_mean",
    });

    assert.equal(baseline.variantSeconds, 1);
    assert.equal(bounded.variantSeconds, 1);
    assert.equal(trimmed.variantSeconds, 1);
  });

  test("uses the correct track-adjustment sign", () => {
    assert.equal(variantAdjustedTimeSeconds(62, 1), 61);
    assert.equal(variantAdjustedTimeSeconds(62, -1), 63);
  });

  test("puts standard, faster, and slower performances on the expected scale", () => {
    assert.equal(provisionalSpeedFigure(60, 60, "fixed_points_per_second"), 100);
    assert.equal(provisionalSpeedFigure(59, 60, "fixed_points_per_second"), 105);
    assert.equal(provisionalSpeedFigure(61, 60, "fixed_points_per_second"), 95);
  });

  test("supports a distance-aware points conversion", () => {
    const points = timeDifferenceToSpeedPoints(1, "distance_aware", {
      distanceYards: 1320,
      winnerTimeSeconds: 72,
    });

    assert.equal(points.toFixed(2), "6.88");
  });

  test("handles missing standard and variant inputs safely", () => {
    assert.equal(variantAdjustedTimeSeconds(62, null), null);
    assert.equal(provisionalSpeedFigure(62, null, "fixed_points_per_second"), null);
  });
});

describe("going adjustment diagnostics", () => {
  test("normalizes timing deviation per furlong", () => {
    assert.equal(distanceYardsToFurlongs(1760), 8);
    assert.equal(
      deviationPerFurlong({
        actualTimeSeconds: 99,
        standardSeconds: 95,
        distanceYards: 1760,
      }),
      0.5,
    );
  });

  test("adjusts a base standard by seconds per furlong", () => {
    assert.equal(
      goingAdjustedStandardSeconds({
        baseStandardSeconds: 95,
        adjustmentSecondsPerFurlong: 0.5,
        distanceYards: 1760,
      }),
      99,
    );
  });

  test("returns null for missing adjustment inputs", () => {
    assert.equal(distanceYardsToFurlongs(null), null);
    assert.equal(
      deviationPerFurlong({
        actualTimeSeconds: 99,
        standardSeconds: 95,
        distanceYards: null,
      }),
      null,
    );
    assert.equal(
      goingAdjustedStandardSeconds({
        baseStandardSeconds: 95,
        adjustmentSecondsPerFurlong: null,
        distanceYards: 1760,
      }),
      null,
    );
    assert.equal(absoluteTimingErrorSeconds(null, 95), null);
  });

  test("calculates absolute timing error", () => {
    assert.equal(absoluteTimingErrorSeconds(99, 95), 4);
    assert.equal(absoluteTimingErrorSeconds(91, 95), 4);
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
