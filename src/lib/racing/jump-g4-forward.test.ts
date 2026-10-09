import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  appendJumpG4Observations,
  buildJumpG4RaceObservations,
  emptyJumpG4ForwardData,
  renderJumpG4Summary,
  type JumpG4Observation,
} from "./jump-g4-forward";
import type { TodayRace, TodayRunner } from "./todays-racing";

describe("jump G4 forward tracker", () => {
  test("qualifies fixed G4 without OR or market filters", () => {
    const race = raceWith([
      runner("target", { average: 120, latest: 105, previous: 100, officialRating: 110, quotes: [] }),
      runner("or-leader", { average: 115, latest: 99, previous: 99, officialRating: 140, quotes: [{ decimalOdds: 2 }] }),
      runner("priced", { average: 100, latest: 95, previous: 94, officialRating: 100, quotes: [{ decimalOdds: 4 }] }),
    ]);
    const observations = buildJumpG4RaceObservations({
      race,
      course: "Teston",
      raceDate: "2026-10-09",
      previousClassByRunner: new Map([["target", 3], ["or-leader", 3], ["priced", 4]]),
      priorUsableJumpSpeedCountByRunner: new Map([["target", 2]]),
      tissueContextByRunner: new Map([["target", { rank: 4, probability: 0.12 }]]),
      recordedAt: new Date("2026-10-09T10:00:00.000Z"),
    });
    assert.equal(observations.length, 1);
    assert.equal(observations[0]!.runnerId, "target");
    assert.equal(observations[0]!.context.officialRatingRank, 2);
    assert.equal(observations[0]!.market.medianBookmakerDecimal, null);
    assert.equal(observations[0]!.context.priorUsableJumpSpeedCount, 2);
  });

  test("does not duplicate the same race-runner capture", () => {
    const observation = { raceId: "race", runnerId: "runner", recordedAt: "2026-10-09T10:00:00.000Z", scheduledOff: "2026-10-09T12:00:00.000Z", settledAt: null } as JumpG4Observation;
    const data = appendJumpG4Observations(emptyJumpG4ForwardData(), [observation, observation]);
    assert.equal(data.observations.length, 1);
  });

  test("fixed G4 rank, improvement and class boundaries remain unchanged", () => {
    const evaluate = (average: number, latest: number, previousClass: number) => buildJumpG4RaceObservations({
      race: raceWith([
        runner("target", { average, latest, previous: 100, officialRating: 80, quotes: [] }),
        ...[130, 125, 120].map((value, index) => runner(`peer-${index}`, { average: value, latest: 100, previous: 100, officialRating: 140, quotes: [] })),
      ]),
      course: "Teston", raceDate: "2026-10-09", previousClassByRunner: new Map([["target", previousClass]]),
      priorUsableJumpSpeedCountByRunner: new Map(), tissueContextByRunner: new Map(),
      recordedAt: new Date("2026-10-09T10:00:00Z"),
    });
    assert.equal(evaluate(120, 101, 3).length, 1); // Competition-rank tie at #3.
    assert.equal(evaluate(119, 101, 3).length, 0);
    assert.equal(evaluate(120, 100, 3).length, 0);
    assert.equal(evaluate(120, 101, 4).length, 0);
    assert.equal(evaluate(120, 101, 5).length, 0);
  });

  test("prospective evaluation cannot backfill or capture after off", () => {
    for (const recordedAt of ["2026-10-08T10:00:00Z", "2026-10-09T12:00:00Z", "2026-10-09T13:00:00Z"]) {
      assert.equal(buildJumpG4RaceObservations({
        race: raceWith([
          runner("target", { average: 120, latest: 110, previous: 100, officialRating: 80, quotes: [] }),
          runner("peer", { average: 100, latest: 100, previous: 100, officialRating: 140, quotes: [] }),
        ]), course: "Teston", raceDate: "2026-10-09", previousClassByRunner: new Map([["target", 3]]), priorUsableJumpSpeedCountByRunner: new Map(), tissueContextByRunner: new Map(), recordedAt: new Date(recordedAt),
      }).length, 0);
    }
  });

  test("summary labels the tracker as research shadow only", () => {
    assert.match(renderJumpG4Summary(emptyJumpG4ForwardData()), /Research shadow only/);
  });
});

function raceWith(runners: TodayRunner[]): TodayRace {
  return {
    raceId: "race",
    sourceId: "source-race",
    scheduledTime: "12:00",
    raceDateTime: new Date("2026-10-09T12:00:00.000Z"),
    courseCountry: "GB",
    raceName: "Novices' Handicap Hurdle",
    raceClass: "Class 4",
    raceType: "Hurdle",
    raceTypeCode: "HUR",
    distance: null,
    distanceYards: null,
    going: null,
    surface: null,
    declaredRunnerCount: runners.length,
    actualRunnerCount: null,
    winningTime: null,
    runners,
  };
}

function runner(
  runnerId: string,
  input: { average: number; latest: number; previous: number; officialRating: number; quotes: Array<{ decimalOdds: number }> },
): TodayRunner {
  return {
    runnerId,
    runnerSourceId: runnerId,
    horseId: `horse-${runnerId}`,
    horseName: runnerId,
    saddleclothNumber: null,
    horseAge: null,
    horseSex: null,
    weight: null,
    weightCarriedLbs: null,
    draw: null,
    jockeyName: null,
    trainerId: null,
    trainerName: null,
    officialRating: input.officialRating,
    odds: null,
    oddsDecimal: null,
    bookmakerQuotes: input.quotes.map((quote) => ({
      bookmakerId: null,
      bookmakerName: null,
      fractionalOdds: null,
      decimalOdds: quote.decimalOdds,
    })),
    resultStatus: null,
    finishingPosition: null,
    metrics: {
      priorRuns: 2,
      priorWins: 0,
      priorPlaces: 0,
      winPercentage: null,
      placePercentage: null,
      latestRpr: null,
      previousRpr: null,
      bestRprLast3: null,
      bestRprLast5: null,
      averageRprLast3: null,
      averageRprLast5: null,
      latestTs: null,
      previousTs: null,
      bestTsLast3: null,
      bestTsLast5: null,
      averageTsLast3: null,
      averageTsLast5: null,
      latestJumpSpeedRating: input.latest,
      previousJumpSpeedRating: input.previous,
      bestJumpSpeedLast3: input.latest,
      bestJumpSpeedLast5: input.latest,
      averageJumpSpeedLast3: input.average,
      averageJumpSpeedLast5: input.average,
      latestJumpPerformanceRating: null,
      previousJumpPerformanceRating: null,
      bestJumpPerformanceLast3: null,
      bestJumpPerformanceLast5: null,
      averageJumpPerformanceLast3: null,
      averageJumpPerformanceLast5: null,
      latestAwSpeedRating: null,
      previousAwSpeedRating: null,
      bestAwSpeedLast3: null,
      bestAwSpeedLast5: null,
      averageAwSpeedLast3: null,
      averageAwSpeedLast5: null,
      latestAwPerformanceRating: null,
      previousAwPerformanceRating: null,
      bestAwPerformanceLast3: null,
      bestAwPerformanceLast5: null,
      averageAwPerformanceLast3: null,
      averageAwPerformanceLast5: null,
      latestTurfSpeedRating: null,
      previousTurfSpeedRating: null,
      bestTurfSpeedLast3: null,
      bestTurfSpeedLast5: null,
      averageTurfSpeedLast3: null,
      averageTurfSpeedLast5: null,
      latestTurfPerformanceRating: null,
      previousTurfPerformanceRating: null,
      bestTurfPerformanceLast3: null,
      bestTurfPerformanceLast5: null,
      averageTurfPerformanceLast3: null,
      averageTurfPerformanceLast5: null,
      latestPerformanceRating: null,
      previousPerformanceRating: null,
      bestPerformanceLast3: null,
      bestPerformanceLast5: null,
      averagePerformanceLast3: null,
      averagePerformanceLast5: null,
      latestTodaysRating: null,
      previousTodaysRating: null,
      bestTodaysRatingLast3: null,
      bestTodaysRatingLast5: null,
      averageTodaysRatingLast3: null,
      averageTodaysRatingLast5: null,
      todaysRatingCalculationVersion: null,
      latestJumpTodaysRating: null,
      previousJumpTodaysRating: null,
      bestJumpTodaysRatingLast3: null,
      bestJumpTodaysRatingLast5: null,
      averageJumpTodaysRatingLast3: null,
      averageJumpTodaysRatingLast5: null,
      latestAwTodaysRating: null,
      previousAwTodaysRating: null,
      bestAwTodaysRatingLast3: null,
      bestAwTodaysRatingLast5: null,
      averageAwTodaysRatingLast3: null,
      averageAwTodaysRatingLast5: null,
      latestTurfTodaysRating: null,
      previousTurfTodaysRating: null,
      bestTurfTodaysRatingLast3: null,
      bestTurfTodaysRatingLast5: null,
      averageTurfTodaysRatingLast3: null,
      averageTurfTodaysRatingLast5: null,
      latestOr: null,
      latestRprMinusPreviousRpr: null,
      latestTsMinusPreviousTs: null,
      latestRprMinusLatestOr: null,
      latestRunDate: null,
      daysSinceLastRun: null,
      breakLengthDays: null,
      runAfterBreakNumber: null,
      runsAtCourse: null,
      winsAtCourse: null,
      placesAtCourse: null,
      runsAtExactDistance: null,
      winsAtExactDistance: null,
      placesAtExactDistance: null,
      runsOnGoing: null,
      winsOnGoing: null,
      placesOnGoing: null,
    },
    trainerMetrics: { trainerPriorRuns: 10, trainerPriorWins: 2, trainerPriorWinRate: 20 },
    jockeyMetrics: { jockeyPriorRuns: 10, jockeyPriorWins: 1, jockeyPriorWinRate: 10 },
  };
}
