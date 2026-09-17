import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createRecord, disagreementByOrContext, orAgreementSummaries, parseTrackerData, renderReport, renderSummary, summarize, TRACKER_VERSION, upsertRace } from "./diagnose-tpr-vs-timewise-forward";

describe("TPR vs Timewise forward tracker", () => {
  const race = (overrides: Partial<Parameters<typeof createRecord>[0]> = {}) => createRecord({
    raceDate: "2026-09-17", course: "Sandown", raceTime: "14:20", winner: "Alpha", winnerSp: 6,
    tprRank1: "Alpha", tprRank2: "Bravo", timewiseRank1: "Charlie", timewiseRank2: "Alpha",
    w50Rank1: "Bravo", orRank1: "Alpha", winnerOrRank: 1, ...overrides,
  });

  test("derives agreement and mutually exclusive top-two outcomes", () => {
    const tprOnly = race({ winner: "Bravo", timewiseRank2: "Delta" });
    const timewiseOnly = race({ winner: "Charlie", tprRank1: "Echo", tprRank2: "Foxtrot" });
    const both = race();
    const neither = race({ winner: "Golf" });
    assert.equal(tprOnly.winnerWasTprOnlyTop2, true);
    assert.equal(timewiseOnly.winnerWasTimewiseOnlyTop2, true);
    assert.equal(both.bothTop2CapturedWinner, true);
    assert.equal(neither.neitherTop2CapturedWinner, true);
  });

  test("summarizes strike, capture, disagreement and priced level-stake returns", () => {
    const races = [
      race(),
      race({ raceTime: "15:20", winner: "Charlie", winnerSp: 4 }),
      race({ raceTime: "16:20", winner: "Golf", winnerSp: null, tprRank1: "Echo", tprRank2: "Foxtrot", timewiseRank1: "Echo", timewiseRank2: "Hotel" }),
    ];
    const summary = summarize(races);
    assert.equal(summary.racesTracked, 3);
    assert.equal(summary.tprRank1Winners, 1);
    assert.equal(summary.timewiseRank1Winners, 1);
    assert.equal(summary.tprTop2Capture, 1 / 3);
    assert.equal(summary.timewiseTop2Capture, 2 / 3);
    assert.equal(summary.rank1AgreementRaces, 1);
    assert.equal(summary.rank1DisagreementRaces, 2);
    assert.equal(summary.tprWinnersInDisagreement, 1);
    assert.equal(summary.timewiseWinnersInDisagreement, 1);
    assert.equal(summary.neitherInDisagreement, 0);
    assert.equal(summary.tprLevelStakeReturn, 4);
    assert.equal(summary.timewiseLevelStakeReturn, 2);
    assert.equal(summary.tprAverageWinnerSp, 6);
    assert.equal(summary.timewiseAverageWinnerSp, 4);
  });

  test("prevents accidental duplicate races and permits explicit correction", () => {
    const first = race(), corrected = race({ winner: "Charlie" });
    const data = upsertRace({ version: TRACKER_VERSION, races: [] }, first);
    assert.throws(() => upsertRace(data, corrected), /already tracked/);
    assert.deepEqual(upsertRace(data, corrected, true).races, [corrected]);
  });

  test("supports pending Today entries without counting them as settled outcomes", () => {
    const pending = race({ winner: null, winnerSp: null, winnerOrRank: null });
    const summary = summarize([pending]);
    assert.equal(pending.winnerWasTprRank1, null);
    assert.equal(pending.winnerWasTimewiseTop2, null);
    assert.equal(summary.racesTracked, 1);
    assert.equal(summary.tprRank1Strike, null);
    assert.equal(summary.rank1DisagreementRaces, 0);
  });

  test("reports timing coverage and excludes known post-race backfills from clean comparisons", () => {
    const preRace = race({ timewiseRecordedAt: "2026-09-17T12:00:00.000Z", timewiseRecordedPreRace: true });
    const postRace = race({ raceTime: "15:20", winner: "Charlie", timewiseRecordedAt: "2026-09-17T16:00:00.000Z", timewiseRecordedPreRace: false });
    const unknown = race({ raceTime: "16:20", winner: "Charlie" });
    const summary = summarize([preRace, postRace, unknown]);
    assert.equal(summary.preRaceEntries, 1);
    assert.equal(summary.postRaceEntries, 1);
    assert.equal(summary.timingUnknownEntries, 1);
    assert.equal(summary.comparisonRaces, 2);
    assert.equal(summary.timewiseRank1Winners, 1);
    assert.match(renderSummary({ version: TRACKER_VERSION, races: [preRace, postRace, unknown] }), /1 pre-race \| 1 post-race\/backfilled \| 1 unknown/);
  });

  test("handles Timewise non-runners without promotion or losing-selection penalties", () => {
    const rank1Nr = race({
      winner: "Bravo",
      timewiseRank1: null,
      timewiseRank1NonRunner: true,
      timewiseRank2: "Bravo",
    });
    const rank2Nr = race({
      raceTime: "15:20",
      timewiseRank2: null,
      timewiseRank2NonRunner: true,
    });
    const bothNr = race({
      raceTime: "16:20",
      timewiseRank1: null,
      timewiseRank1NonRunner: true,
      timewiseRank2: null,
      timewiseRank2NonRunner: true,
    });
    const summary = summarize([rank1Nr, rank2Nr, bothNr]);
    assert.equal(rank1Nr.winnerWasTimewiseRank1, null);
    assert.equal(rank1Nr.winnerWasTimewiseTop2, true);
    assert.equal(rank1Nr.rank1Agree, null);
    assert.equal(rank2Nr.winnerWasTimewiseRank1, false);
    assert.equal(bothNr.winnerWasTimewiseTop2, null);
    assert.equal(summary.timewiseRank1NonRunners, 2);
    assert.equal(summary.timewiseRank2NonRunners, 2);
    assert.equal(summary.timewiseBothNonRunners, 1);
    assert.equal(summary.timewiseRank1Races, 1);
    assert.equal(summary.timewiseTop2Races, 2);
    assert.equal(summary.timewiseRank1Strike, 0);
    assert.equal(summary.timewiseTop2Capture, 1 / 2);
    assert.equal(summary.rank1DisagreementRaces, 1);
    assert.equal(disagreementByOrContext([rank1Nr, bothNr]).reduce((sum, value) => sum + value.races, 0), 0);
    assert.match(renderReport({ version: TRACKER_VERSION, races: [rank1Nr, rank2Nr, bothNr] }), /\| Non-runner \| Bravo \|/);
  });

  test("derives OR agreement and summarizes W100 and W50 splits", () => {
    const races = [
      race(),
      race({ raceTime: "15:20", winner: "Bravo", winnerSp: 5, tprRank1: "Charlie", w50Rank1: "Bravo", orRank1: "Bravo", winnerOrRank: 1 }),
      race({ raceTime: "16:20", winner: "Delta", winnerSp: 8, tprRank1: "Delta", w50Rank1: "Echo", orRank1: "Foxtrot", winnerOrRank: 3 }),
      race({ raceTime: "17:20", winner: "Golf", winnerSp: 10, tprRank1: "Hotel", w50Rank1: "Golf", orRank1: "India", winnerOrRank: 2 }),
    ];
    assert.equal(races[0]!.tpr1AgreesWithOr1, true);
    assert.equal(races[0]!.w50AgreesWithOr1, false);
    assert.equal(races[0]!.timewise1AgreesWithOr1, false);
    assert.equal(races[0]!.winnerIsOr1, true);
    assert.equal(races[2]!.winnerOrRank, 3);
    const summaries = orAgreementSummaries(races);
    assert.deepEqual(summaries.map((value) => [value.rating, value.agrees, value.races, value.winners]), [
      ["TPR W100", true, 1, 1],
      ["TPR W100", false, 3, 1],
      ["W50", true, 1, 1],
      ["W50", false, 3, 1],
    ]);
    assert.equal(summaries[0]!.levelStakeReturn, 5);
    assert.equal(summaries[2]!.averageWinnerSp, 5);
  });

  test("splits TPR versus Timewise disagreements by TPR and OR agreement", () => {
    const values = disagreementByOrContext([
      race(),
      race({ raceTime: "15:20", winner: "Charlie", tprRank1: "Bravo", tprRank2: "Delta", orRank1: "Bravo" }),
      race({ raceTime: "16:20", winner: "Golf", tprRank1: "Delta", timewiseRank1: "Echo", orRank1: "Foxtrot" }),
    ]);
    assert.deepEqual(values, [
      { context: "TPR agrees with OR", races: 2, tprWinners: 1, timewiseWinners: 1, neither: 0, netWinnerDifference: 0 },
      { context: "TPR does not agree with OR", races: 1, tprWinners: 0, timewiseWinners: 0, neither: 1, netWinnerDifference: 0 },
    ]);
  });

  test("keeps missing OR and W50 context unavailable", () => {
    const value = race({ orRank1: null, w50Rank1: null, winnerOrRank: null });
    assert.equal(value.tpr1AgreesWithOr1, null);
    assert.equal(value.w50AgreesWithOr1, null);
    assert.equal(value.timewise1AgreesWithOr1, null);
    assert.equal(value.winnerIsOr1, null);
    assert.equal(orAgreementSummaries([value]).every((summary) => summary.races === 0), true);
  });

  test("loads old v1 JSON records without manual migration", () => {
    const parsed = parseTrackerData({
      version: "tpr_timewise_forward_v1",
      races: [{
        raceDate: "2026-09-16", course: "Yarmouth", raceTime: "15:00", winner: "Alpha", winnerSp: 4,
        tprRank1: "Alpha", tprRank2: "Bravo", timewiseRank1: "Charlie", timewiseRank2: "Alpha",
      }],
    });
    assert.equal(parsed.version, TRACKER_VERSION);
    assert.equal(parsed.races[0]!.winnerWasTprRank1, true);
    assert.equal(parsed.races[0]!.orRank1, null);
    assert.equal(parsed.races[0]!.w50Rank1, null);
    assert.equal(parsed.races[0]!.winnerIsOr1, null);
    assert.equal(parsed.races[0]!.timewiseRecordedAt, null);
    assert.equal(parsed.races[0]!.timewiseRecordedPreRace, null);
    assert.equal(parsed.races[0]!.timewiseRank1NonRunner, false);
    assert.equal(parsed.races[0]!.timewiseRank2NonRunner, false);
  });

  test("renders cumulative metrics and every requested race flag", () => {
    const report = renderReport({ version: TRACKER_VERSION, races: [race()] });
    for (const text of ["TPR rank-1 strike", "Timewise top-2 capture", "rank-1 disagreement races", "TPR £1 level-stake return", "Official Rating agreement splits", "ROI", "TPR vs Timewise disagreements by OR context", "net winner difference", "winner OR rank", "winner=OR1", "TPR=OR", "W50=OR", "TW=OR", "TPR-only top2", "TW-only top2", "both top2", "neither top2"]) assert.match(report, new RegExp(text.replace(/[£-]/g, "\\$&")));
  });

  test("renders the compact summary with all forward comparison aggregates", () => {
    const data = { version: TRACKER_VERSION, races: [
      race(),
      race({ raceTime: "15:20", winner: "Charlie", winnerSp: 4, tprRank1: "Bravo", tprRank2: "Delta", w50Rank1: "Charlie", orRank1: "Bravo" }),
      race({ raceTime: "16:20", winner: "Bravo", winnerSp: 5, tprRank1: "Delta", tprRank2: "Bravo", w50Rank1: "Foxtrot", orRank1: "Foxtrot", timewiseRank1: "Golf", timewiseRank2: "Hotel" }),
      race({ raceTime: "17:20", winner: "India", winnerSp: null, tprRank1: "Juliet", tprRank2: "Kilo", w50Rank1: null, orRank1: null, timewiseRank1: "Lima", timewiseRank2: "Mike" }),
    ] };
    const output = renderSummary(data);
    for (const line of [
      "Races tracked: 4",
      "Rank-1 winners: 1",
      "£1 return / ROI (3 priced): £3.00 / 100.00%",
      "Top-2 capture: 50.00%",
      "Races: 4 | W100 winners: 1 | Timewise winners: 1 | Neither: 2",
      "Races: 3 | W50 winners: 1 | W100 winners: 1 | Neither: 1",
      "W100 + OR: 2 races / 50.00%",
      "W100 without OR: 1 races / 0.00%",
      "W50 + OR: 1 races / 0.00%",
      "TPR-only: 1 | Timewise-only: 1 | Both: 1 | Neither: 1",
    ]) assert.match(output, new RegExp(line.replace(/[£+|()]/g, "\\$&")));
  });
});
