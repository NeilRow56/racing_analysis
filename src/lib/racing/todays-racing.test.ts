import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatRaceTimeForDisplay,
  formatTodayTprRankGap,
  formatRacingDate,
  getLocalRacingDate,
  groupTodaysRacingRows,
  isAllWeatherRaceForDisplay,
  isJumpRaceForDisplay,
  isOrdinaryFlatTurfRaceForDisplay,
  meetingOrderFromIndexPayload,
  parseSportingLifeBookmakerQuotes,
  racingPageTitle,
  reconcileSportingLifeCurrentCardRows,
  resolveRacingDate,
  sportingLifeCurrentPriceFromRacecard,
  sportingLifeCurrentCardReconciliation,
  summarizeTodayMarketPrice,
  TODAY_RACE_SOURCE_TYPES,
  type SportingLifeCurrentCardDiagnostic,
  type TodayRacecardRow,
} from "./todays-racing";
import type { HorseMetricsAsOf } from "./horse-metrics";
import type { GoingForm } from "./going-form";
import { getTprConfidenceContext } from "./tpr-confidence-context";

describe("Today racing grouping", () => {
  test("attaches actual-history context without changing ratings, ranks or snapshot inputs", () => {
    const context = getTprConfidenceContext([1, 2].map(id => ({ runnerId: String(id), raceDateTime: new Date(`2026-01-0${id}`), resultStatus: "finished", finishingPosition: 4, weightCarriedLbs: 135, turfSpeedRating: { rating: 100 } })), new Date("2026-10-01"));
    const form = metric({ latestTurfPerformanceRating: 67.853, latestTurfSpeedRating: 100.853 });
    const baseline = groupTodaysRacingRows([row()], new Map(), new Map([["runner-1", form]]));
    const annotated = groupTodaysRacingRows([row()], new Map(), new Map([["runner-1", { ...form, tprConfidence: context }]]));
    const before = baseline[0]!.races[0]!.runners[0]!;
    const after = annotated[0]!.races[0]!.runners[0]!;
    assert.ok(before.turfPerformanceRating);
    assert.deepEqual(after.turfPerformanceRating, before.turfPerformanceRating);
    assert.deepEqual(after.turfPerformanceInput, before.turfPerformanceInput);
    assert.equal(after.turfPerformanceRating?.historyDepth, 1);
    assert.equal(after.tprConfidence?.historyDepthLabel, "2-run basis");
    assert.equal(after.tprConfidence?.limitedHistory, false);
  });
  test("labels TPR rating-point leads and deficits without probability-point units", () => {
    assert.equal(formatTodayTprRankGap(1, 11.7), "Rank 1 · TPR lead +11.7");
    assert.equal(formatTodayTprRankGap(2, -11.7), "Rank 2 · TPR deficit -11.7");
    assert.equal(formatTodayTprRankGap(1, null), "Rank 1");
    assert.doesNotMatch(formatTodayTprRankGap(1, 11.7), /pp/);
  });

  test("projects only valid Sporting Life bookmaker quote fields", () => {
    assert.deepEqual(parseSportingLifeBookmakerQuotes([
      { bookmakerId: 6, bookmakerName: "Paddy Power", fractionalOdds: "6/1", decimalOdds: 7, ignored: "x" },
      { bookmakerId: 4, bookmakerName: "Betfair Sportsbook", fractionalOdds: "11/2", decimalOddsString: "6.5" },
      { bookmakerId: 9, bookmakerName: "Invalid", decimalOdds: 1 },
    ]), [
      { bookmakerId: 6, bookmakerName: "Paddy Power", fractionalOdds: "6/1", decimalOdds: 7 },
      { bookmakerId: 4, bookmakerName: "Betfair Sportsbook", fractionalOdds: "11/2", decimalOdds: 6.5 },
    ]);
  });

  test("uses bookmaker medians and retains best-provider and forecast diagnostics", () => {
    const market = summarizeTodayMarketPrice({
      odds: "20/1",
      oddsDecimal: "21",
      forecastOdds: "20/1",
      forecastDecimalOdds: 21,
      bookmakerQuotes: [
        quote(6.5, "11/2", "Betfair Sportsbook", 4),
        quote(7, "6/1", "Paddy Power", 6),
        quote(7, "6/1", "Sky Bet", 17),
      ],
    });
    assert.equal(market.medianDecimalOdds, 7);
    assert.equal(market.medianFractionalOdds, "6/1");
    assert.equal(market.bestDecimalOdds, 7);
    assert.deepEqual(market.bestBookmakerNames, ["Paddy Power", "Sky Bet"]);
    assert.equal(market.forecastOdds, "20/1");
  });

  test("uses the arithmetic median for an even bookmaker count", () => {
    const market = summarizeTodayMarketPrice({ bookmakerQuotes: [quote(4, "3/1"), quote(5, "4/1")] });
    assert.equal(market.medianDecimalOdds, 4.5);
    assert.equal(market.medianFractionalOdds, "7/2");
  });

  test("a refreshed racecard payload immediately changes the Today market price", () => {
    const before = groupTodaysRacingRows([row({ bookmakerQuotes: bookmakerOdds(7, "6/1") })]);
    const after = groupTodaysRacingRows([row({ bookmakerQuotes: bookmakerOdds(5, "4/1") })]);
    assert.equal(summarizeTodayMarketPrice(before[0]!.races[0]!.runners[0]!).medianFractionalOdds, "6/1");
    assert.equal(summarizeTodayMarketPrice(after[0]!.races[0]!.runners[0]!).medianFractionalOdds, "4/1");
  });

  test("does not fall back to forecast when no bookmaker quote exists", () => {
    const market = summarizeTodayMarketPrice({ odds: "20/1", oddsDecimal: "21", bookmakerQuotes: [] });
    assert.equal(market.medianDecimalOdds, null);
    assert.equal(market.medianFractionalOdds, null);
    assert.equal(market.forecastOdds, "20/1");
  });

  test("keeps bookmaker median and Sporting Life forecast separate in Tissue context", () => {
    const base = {
      raceId: "race-1",
      runnerId: "runner-1",
      scheduledTime: "13:40:00",
      raceDateTime: new Date("2026-09-30T13:40:00.000Z"),
      courseCountry: "Eire",
      forecastPrice: "20/1",
      forecastDecimalOdds: 21,
    };
    const quoted = sportingLifeCurrentPriceFromRacecard({
      ...base,
      bookmakerQuotes: [quote(6.5, "11/2"), quote(7, "6/1"), quote(7, "6/1")],
    });
    assert.equal(quoted.marketPrice, "6/1");
    assert.equal(quoted.marketDecimalOdds, 7);
    assert.equal(quoted.forecastPrice, "20/1");

    const forecastOnly = sportingLifeCurrentPriceFromRacecard({
      ...base,
      forecastPrice: "33/1",
      forecastDecimalOdds: 34,
      bookmakerQuotes: [],
    });
    assert.equal(forecastOnly.marketPrice, null);
    assert.equal(forecastOnly.marketDecimalOdds, null);
    assert.equal(forecastOnly.forecastPrice, "33/1");
  });

  test("accepts racecard or full-result provenance without duplicate source types", () => {
    assert.deepEqual(TODAY_RACE_SOURCE_TYPES, [
      "racecard-next-data",
      "full-result-next-data",
    ]);
    assert.equal(new Set(TODAY_RACE_SOURCE_TYPES).size, TODAY_RACE_SOURCE_TYPES.length);
  });

  test("reconciles Bellewstown replacement cards without mutating stored versions", () => {
    const raceRows = (
      raceId: string,
      sourceId: string,
      time: string,
      raceName: string,
      declared: number,
      horseIds: string[],
    ) => horseIds.map((horseId, index) => row({
      raceId,
      raceSourceId: sourceId,
      raceDate: "2026-09-30",
      scheduledTime: `${time}:00`,
      raceName,
      distanceYards: 1760,
      declaredRunnerCount: declared,
      courseId: "course-bellewstown",
      courseSourceId: "336",
      courseName: "Bellewstown",
      country: "Eire",
      runnerId: `${raceId}-runner-${index}`,
      runnerSourceId: `${sourceId}-ride-${index}`,
      horseId,
      horseName: horseId,
    }));
    const rows = [
      ...raceRows("current-boyle", "941452", "13:40", "BOYLE Sports Handicap (0-60)", 18, ["ohmali", "blue-panther"]),
      ...raceRows("stale-boyle", "940938", "13:44", "BOYLE Sports Handicap (0-60)", 32, ["ohmali", "blue-panther", "blue-anthem"]),
      ...raceRows("current-rathbarry", "941453", "14:15", "Rathbarry & Glenview Studs Handicap", 17, ["moyassr", "mythical-rock"]),
      ...raceRows("stale-rathbarry", "940939", "14:19", "Rathbarry & Glenview Studs Handicap", 21, ["moyassr", "mythical-rock", "emiza"]),
    ];
    const before = JSON.stringify(rows);
    const diagnostics: SportingLifeCurrentCardDiagnostic[] = [];
    const payload = currentCardIndexPayload("Bellewstown", "121682", [
      ["941452", "BOYLE Sports Handicap (0-60)"],
      ["940938", "BOYLE Sports Handicap (0-60)"],
      ["941453", "Rathbarry & Glenview Studs Handicap"],
      ["940939", "Rathbarry & Glenview Studs Handicap"],
    ]);
    const reconciled = reconcileSportingLifeCurrentCardRows(
      rows,
      payload,
      (diagnostic) => diagnostics.push(diagnostic),
    );
    const detailed = sportingLifeCurrentCardReconciliation(rows, payload);

    assert.equal(JSON.stringify(rows), before);
    assert.deepEqual([...new Set(rows.map((entry) => entry.raceSourceId))], ["941452", "940938", "941453", "940939"]);
    assert.deepEqual([...new Set(reconciled.map((entry) => entry.raceSourceId))], ["941452", "941453"]);
    assert.deepEqual([...new Set(reconciled.map((entry) => entry.declaredRunnerCount))], [18, 17]);
    assert.deepEqual([...detailed.currentReplacementRaceIds].sort(), ["current-boyle", "current-rathbarry"]);
    assert.deepEqual([...detailed.supersededRaceIds].sort(), ["stale-boyle", "stale-rathbarry"]);
    assert.equal(diagnostics.length, 2);
    assert.deepEqual(diagnostics.map((entry) => [entry.staleSourceRaceId, entry.currentSourceRaceId]), [
      ["940938", "941452"],
      ["940939", "941453"],
    ]);
  });

  test("does not collapse legitimate Sligo races or ambiguous versions", () => {
    const sligoRows = [
      row({ raceId: "sligo-1", raceSourceId: "950001", raceDate: "2026-09-30", courseName: "Sligo", courseId: "sligo", horseId: "horse-a", raceName: "Maiden", scheduledTime: "13:20:00" }),
      row({ raceId: "sligo-2", raceSourceId: "950002", raceDate: "2026-09-30", courseName: "Sligo", courseId: "sligo", horseId: "horse-b", raceName: "Handicap", scheduledTime: "13:25:00" }),
    ];
    const diagnostics: unknown[] = [];
    const reconciled = reconcileSportingLifeCurrentCardRows(
      sligoRows,
      currentCardIndexPayload("Sligo", "meeting-sligo", [["950001", "Maiden"], ["950002", "Handicap"]]),
      (diagnostic) => diagnostics.push(diagnostic),
    );
    assert.strictEqual(reconciled, sligoRows);
    assert.equal(reconciled.length, 2);
    assert.deepEqual(diagnostics, []);
    assert.equal(summarizeTodayMarketPrice({ bookmakerQuotes: [quote(4, "3/1"), quote(5, "4/1"), quote(6, "5/1")] }).medianFractionalOdds, "4/1");
  });

  test("preserves both versions when current-index precedence is ambiguous", () => {
    const candidate = (raceId: string, sourceId: string, time: string) => ["alpha", "beta"].map((horseId, index) => row({
      raceId,
      raceSourceId: sourceId,
      raceDate: "2026-09-30",
      scheduledTime: `${time}:00`,
      raceName: "Example Handicap",
      distanceYards: 1760,
      courseId: "course-example",
      courseName: "Example",
      runnerId: `${raceId}-${index}`,
      horseId,
      horseName: horseId,
    }));
    const rows = [...candidate("first", "940001", "14:00"), ...candidate("second", "941001", "14:04")];
    const diagnostics: SportingLifeCurrentCardDiagnostic[] = [];
    const reconciled = reconcileSportingLifeCurrentCardRows(
      rows,
      currentCardIndexPayload("Example", "meeting-example", [["940001", "Example Handicap"], ["941001", "Example Handicap"]]),
      (diagnostic) => diagnostics.push(diagnostic),
    );
    assert.strictEqual(reconciled, rows);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]!.status, "ambiguous");
  });

  test("groups the eight imported Downpatrick result races into Today", () => {
    const raceIds = ["939524", "939225", "939226", "939227", "939228", "939229", "939230", "939231"];
    const grouped = groupTodaysRacingRows(
      raceIds.map((raceId, index) => row({
        raceId,
        raceSourceId: raceId,
        runnerId: `runner-${raceId}`,
        courseId: "course-downpatrick",
        courseSourceId: "354",
        courseName: "Downpatrick",
        country: "Nort",
        scheduledTime: `${String(12 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "37" : "12"}:00`,
      })),
      meetingOrderFromIndexPayload(indexPayload(["354"])),
    );

    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].courseName, "Downpatrick");
    assert.deepEqual(
      new Set(grouped[0].races.map((race) => race.sourceId)),
      new Set(raceIds),
    );
  });

  test("groups UK and Ireland meetings in racecard index order", () => {
    const grouped = groupTodaysRacingRows(
      [
        row({
          courseId: "course-redcar",
          courseSourceId: "320",
          courseName: "Redcar",
          country: "ENG",
          raceId: "race-redcar",
          raceSourceId: "937442",
        }),
        row({
          courseId: "course-cork",
          courseSourceId: "344",
          courseName: "Cork",
          country: "Eire",
          raceId: "race-cork",
          raceSourceId: "937407",
        }),
        row({
          courseId: "course-carlisle",
          courseSourceId: "302",
          courseName: "Carlisle",
          country: "ENG",
          raceId: "race-carlisle",
          raceSourceId: "937435",
        }),
      ],
      meetingOrderFromIndexPayload(indexPayload(["302", "320", "344"])),
    );

    assert.deepEqual(
      grouped.map((meeting) => [meeting.courseName, meeting.country]),
      [
        ["Carlisle", "ENG"],
        ["Redcar", "ENG"],
        ["Cork", "Eire"],
      ],
    );
  });

  test("orders races by scheduled time within a meeting", () => {
    const grouped = groupTodaysRacingRows([
      row({
        raceId: "race-late",
        raceSourceId: "2",
        scheduledTime: "14:15:00",
      }),
      row({
        raceId: "race-early",
        raceSourceId: "1",
        scheduledTime: "13:40:00",
      }),
    ]);

    assert.deepEqual(
      grouped[0].races.map((race) => race.scheduledTime),
      ["13:40:00", "14:15:00"],
    );
  });

  test("orders runners by bookmaker median and keeps forecast separately", () => {
    const grouped = groupTodaysRacingRows([
      row({
        runnerId: "runner-5-2",
        saddleclothNumber: 3,
        horseName: "Five To Two",
        odds: "5/2",
        bookmakerQuotes: bookmakerOdds(3.5, "5/2"),
      }),
      row({
        runnerId: "runner-6-4",
        saddleclothNumber: 1,
        horseName: "Six To Four",
        odds: "6/4",
        bookmakerQuotes: bookmakerOdds(2.5, "6/4"),
      }),
      row({
        runnerId: "runner-10-1",
        saddleclothNumber: 5,
        horseName: "Ten To One",
        odds: "10/1",
        bookmakerQuotes: bookmakerOdds(11, "10/1"),
      }),
      row({
        runnerId: "runner-4-1",
        saddleclothNumber: 4,
        horseName: "Four To One",
        odds: "4/1",
        bookmakerQuotes: bookmakerOdds(5, "4/1"),
      }),
      row({
        runnerId: "runner-15-8",
        saddleclothNumber: 2,
        horseName: "Fifteen To Eight",
        odds: "15/8",
        bookmakerQuotes: bookmakerOdds(2.875, "15/8"),
      }),
    ]);

    assert.deepEqual(
      grouped[0].races[0].runners.map((runner) => runner.odds),
      ["6/4", "15/8", "5/2", "4/1", "10/1"],
    );
  });

  test("uses decimal odds for sorting without changing displayed odds", () => {
    const grouped = groupTodaysRacingRows([
      row({
        runnerId: "runner-longer",
        saddleclothNumber: 1,
        horseName: "Longer",
        odds: "6/4",
        oddsDecimal: "3.25",
        bookmakerQuotes: bookmakerOdds(3.25, "9/4"),
      }),
      row({
        runnerId: "runner-shorter",
        saddleclothNumber: 2,
        horseName: "Shorter",
        odds: "15/8",
        oddsDecimal: "2.10",
        bookmakerQuotes: bookmakerOdds(2.1, "11/10"),
      }),
    ]);

    assert.deepEqual(
      grouped[0].races[0].runners.map((runner) => runner.odds),
      ["15/8", "6/4"],
    );
  });

  test("uses saddlecloth order as the stable order for equal prices", () => {
    const grouped = groupTodaysRacingRows([
      row({
        runnerId: "runner-3",
        runnerSourceId: "ride-3",
        saddleclothNumber: 3,
        horseName: "Third",
        odds: "5/1",
        bookmakerQuotes: bookmakerOdds(6, "5/1"),
      }),
      row({
        runnerId: "runner-1",
        runnerSourceId: "ride-1",
        saddleclothNumber: 1,
        horseName: "First",
        odds: "5/1",
        bookmakerQuotes: bookmakerOdds(6, "5/1"),
      }),
    ]);

    assert.deepEqual(
      grouped[0].races[0].runners.map((runner) => runner.horseName),
      ["First", "Third"],
    );
  });

  test("sorts missing or unparseable odds after valid odds", () => {
    const grouped = groupTodaysRacingRows([
      row({
        runnerId: "runner-missing",
        saddleclothNumber: 1,
        horseName: "Missing",
        odds: null,
      }),
      row({
        runnerId: "runner-unparseable",
        saddleclothNumber: 2,
        horseName: "Unparseable",
        odds: "SP",
      }),
      row({
        runnerId: "runner-valid",
        saddleclothNumber: 3,
        horseName: "Valid",
        odds: "10/1",
        bookmakerQuotes: bookmakerOdds(11, "10/1"),
      }),
    ]);

    assert.deepEqual(
      grouped[0].races[0].runners.map((runner) => runner.horseName),
      ["Valid", "Missing", "Unparseable"],
    );
  });

  test("orders non-runners after active runners while keeping them visible", () => {
    const grouped = groupTodaysRacingRows([
      row({
        runnerId: "runner-non-runner",
        runnerSourceId: "ride-1",
        saddleclothNumber: 1,
        horseName: "Non Runner",
        odds: "1/2",
        resultStatus: "non_runner",
      }),
      row({
        runnerId: "runner-active",
        runnerSourceId: "ride-2",
        saddleclothNumber: 2,
        horseName: "Active",
        odds: "10/1",
      }),
    ]);

    assert.deepEqual(
      grouped[0].races[0].runners.map((runner) => runner.horseName),
      ["Active", "Non Runner"],
    );
    assert.equal(grouped[0].races[0].runners[1].resultStatus, "non_runner");
  });

  test("attaches pre-race metrics to the matching runner only", () => {
    const metrics = metric({ latestJumpSpeedRating: 91 });
    const grouped = groupTodaysRacingRows(
      [
        row({ runnerId: "runner-with-metrics" }),
        row({ runnerId: "runner-without-metrics", saddleclothNumber: 2 }),
      ],
      new Map(),
      new Map([["runner-with-metrics", metrics]]),
    );

    assert.equal(
      grouped[0].races[0].runners[0].metrics?.latestJumpSpeedRating,
      91,
    );
    assert.equal(grouped[0].races[0].runners[1].metrics, null);
  });

  test("attaches batched going form to the matching runner only", () => {
    const goingForm: GoingForm = {
      firm: false,
      good: true,
      soft: true,
      yielding: false,
      heavy: false,
      firmCount: 0,
      goodCount: 2,
      softCount: 1,
      yieldingCount: 0,
      heavyCount: 0,
    };
    const grouped = groupTodaysRacingRows(
      [
        row({ runnerId: "runner-with-form" }),
        row({ runnerId: "runner-without-form", saddleclothNumber: 2 }),
      ],
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map([["runner-with-form", goingForm]]),
    );

    assert.deepEqual(grouped[0].races[0].runners[0].goingForm, goingForm);
    assert.equal(grouped[0].races[0].runners[1].goingForm, undefined);
  });

  test("attaches diagnostic TPR to ordinary Flat Turf runners only", () => {
    const grouped = groupTodaysRacingRows(
      [
        row({
          runnerId: "runner-top",
          horseName: "Top",
          saddleclothNumber: 1,
          weightCarriedLbs: 130,
          odds: "2/1",
        }),
        row({
          runnerId: "runner-second",
          horseName: "Second",
          saddleclothNumber: 2,
          weightCarriedLbs: 126,
          odds: "3/1",
        }),
      ],
      new Map(),
      new Map([
        ["runner-top", metric({
          latestTurfPerformanceRating: 70,
          previousTurfPerformanceRating: 64,
          averageTurfPerformanceLast3: 62,
          latestTurfSpeedRating: 105,
          previousTurfSpeedRating: 100,
          averageTurfSpeedLast3: 98,
        })],
        ["runner-second", metric({
          latestTurfPerformanceRating: 61,
          previousTurfPerformanceRating: 58,
          averageTurfPerformanceLast3: 56,
          latestTurfSpeedRating: 95,
          previousTurfSpeedRating: 92,
          averageTurfSpeedLast3: 90,
        })],
      ]),
    );

    const [top, second] = grouped[0].races[0].runners;
    assert.equal(top.turfPerformanceRating?.rank, 1);
    assert.equal(top.turfPerformanceRating?.historyDepth, 3);
    assert.equal(top.turfPerformanceRating?.version, "TPR_S2_V1");
    assert.equal(second.turfPerformanceRating?.rank, 2);
    assert.equal(second.turfPerformanceRating?.gap !== null, true);
    assert.equal((second.turfPerformanceRating?.gap ?? 0) < 0, true);
    assert.equal(top.turfPerformanceShadowRating?.rank, 1);
    assert.equal(grouped[0].races[0].turfPerformanceShadow?.agreement, true);
  });

  test("does not use AW history when Turf TPR is unavailable", () => {
    const grouped = groupTodaysRacingRows(
      [
        row({
          runnerId: "runner-aw-fallback",
          horseName: "AW Fallback",
          saddleclothNumber: 1,
          weightCarriedLbs: 130,
        }),
        row({
          runnerId: "runner-unrated",
          horseName: "Unrated",
          saddleclothNumber: 2,
          weightCarriedLbs: 128,
        }),
      ],
      new Map(),
      new Map([
        ["runner-aw-fallback", metric({
          latestAwSpeedRating: 100,
        })],
        ["runner-unrated", metric()],
      ]),
    );

    const rated = grouped[0].races[0].runners[0];
    assert.equal(rated.turfPerformanceRating, undefined);
    assert.equal(grouped[0].races[0].runners[1].turfPerformanceRating, undefined);
  });

  test("keeps same-surface Turf TPR when AW history also exists", () => {
    const grouped = groupTodaysRacingRows(
      [row({ runnerId: "runner-both", weightCarriedLbs: 130 })],
      new Map(),
      new Map([
        ["runner-both", metric({
          latestTurfPerformanceRating: 70,
          latestTurfSpeedRating: 105,
          latestAwSpeedRating: 120,
        })],
      ]),
    );

    assert.equal(grouped[0].races[0].runners[0].turfPerformanceRating?.basis, "turf");
    assert.equal(grouped[0].races[0].runners[0].turfPerformanceRating?.isCrossSurfaceFallback, false);
  });

  test("records W50/W100 rank-1 disagreement without changing production rank", () => {
    const grouped = groupTodaysRacingRows(
      [
        row({
          runnerId: "runner-production",
          horseName: "Production Pick",
          saddleclothNumber: 1,
          weightCarriedLbs: 150,
        }),
        row({
          runnerId: "runner-shadow",
          horseName: "Shadow Pick",
          saddleclothNumber: 2,
          weightCarriedLbs: 120,
        }),
      ],
      new Map(),
      new Map([
        ["runner-production", metric({
          latestTurfPerformanceRating: 40,
          latestTurfSpeedRating: 85,
        })],
        ["runner-shadow", metric({
          latestTurfPerformanceRating: 65,
          latestTurfSpeedRating: 115,
        })],
      ]),
    );

    const race = grouped[0].races[0];
    const productionPick = race.runners.find((runner) => runner.runnerId === "runner-production");
    const shadowPick = race.runners.find((runner) => runner.runnerId === "runner-shadow");
    assert.equal(productionPick?.turfPerformanceRating?.rank, 1);
    assert.equal(shadowPick?.turfPerformanceShadowRating?.rank, 1);
    assert.equal(race.turfPerformanceShadow?.agreement, false);
    assert.equal(race.turfPerformanceShadow?.w100RunnerId, "runner-production");
    assert.equal(race.turfPerformanceShadow?.w50RunnerId, "runner-shadow");
  });

  test("does not attach diagnostic TPR to AW or Jump races", () => {
    const metrics = metric({
      latestPerformanceRating: 70,
      previousPerformanceRating: 64,
      averagePerformanceLast3: 62,
      latestTurfSpeedRating: 105,
      previousTurfSpeedRating: 100,
      averageTurfSpeedLast3: 98,
    });
    const grouped = groupTodaysRacingRows(
      [
        row({
          raceId: "race-aw",
          runnerId: "runner-aw",
          courseName: "Kempton",
          going: "Standard",
          surface: "POLYTRACK",
        }),
        row({
          raceId: "race-jump",
          runnerId: "runner-jump",
          saddleclothNumber: 2,
          raceName: "Novices' Hurdle",
          raceType: "hurdle",
          surface: "TURF",
        }),
      ],
      new Map(),
      new Map([
        ["runner-aw", metrics],
        ["runner-jump", metrics],
      ]),
    );

    assert.equal(grouped[0].races[0].runners[0].turfPerformanceRating, undefined);
    assert.equal(grouped[0].races[1].runners[0].turfPerformanceRating, undefined);
  });

  test("classifies current AW racecards from explicit surface when going is blank", () => {
    assert.equal(
      isAllWeatherRaceForDisplay({
        raceName: "Sky Sports Racing Nursery",
        raceType: null,
        courseName: "Lingfield",
        courseSourceId: "353",
        going: "",
        surface: "POLYTRACK",
      }),
      true,
    );
  });

  test("does not force ambiguous blank-going Lingfield races to AW", () => {
    assert.equal(
      isAllWeatherRaceForDisplay({
        raceName: "Handicap",
        raceType: "handicap",
        courseName: "Lingfield",
        courseSourceId: "353",
        going: "",
        surface: null,
      }),
      false,
    );
  });
});

describe("Today racing display helpers", () => {
  test("uses the Europe/London current date when no override is supplied", () => {
    assert.equal(
      resolveRacingDate({
        now: new Date("2026-09-09T23:30:00.000Z"),
      }).raceDate,
      "2026-09-10",
    );
  });

  test("explicit date override works", () => {
    assert.deepEqual(
      resolveRacingDate({
        dateParam: "2026-09-09",
        now: new Date("2026-09-10T12:00:00.000Z"),
      }),
      {
        raceDate: "2026-09-09",
        dateOverride: true,
        invalidDateParam: null,
      },
    );
  });

  test("invalid date override falls back to the Europe/London current date", () => {
    assert.deepEqual(
      resolveRacingDate({
        dateParam: "not-a-date",
        now: new Date("2026-09-10T12:00:00.000Z"),
      }),
      {
        raceDate: "2026-09-10",
        dateOverride: false,
        invalidDateParam: "not-a-date",
      },
    );
  });

  test("new racing day resolution does not reuse the prior day", () => {
    assert.equal(
      getLocalRacingDate(new Date("2026-09-10T00:30:00.000+01:00")),
      "2026-09-10",
    );
  });

  test("historical overrides are not labelled as today's racing", () => {
    assert.equal(
      racingPageTitle({
        raceDate: "2026-09-09",
        now: new Date("2026-09-10T12:00:00.000Z"),
      }),
      "Racing",
    );
  });

  test("current date is labelled as today's racing", () => {
    assert.equal(
      racingPageTitle({
        raceDate: "2026-09-10",
        now: new Date("2026-09-10T12:00:00.000Z"),
      }),
      "Today's Racing",
    );
  });

  test("identifies jump races and leaves flat races out of speed display", () => {
    assert.equal(
      isJumpRaceForDisplay({
        raceName: "Weatherbys Novices' Hurdle",
        raceType: null,
      }),
      true,
    );
    assert.equal(
      isJumpRaceForDisplay({
        raceName: "EBF Fillies' Restricted Novice Stakes",
        raceType: "stakes",
      }),
      false,
    );
  });

  test("identifies all-weather races for AW speed display", () => {
    assert.equal(
      isAllWeatherRaceForDisplay({
        raceName: "Fillies' Handicap",
        raceType: "handicap",
        courseName: "Kempton",
        going: "Standard / Slow",
      }),
      true,
    );
    assert.equal(
      isAllWeatherRaceForDisplay({
        raceName: "Turf Handicap",
        raceType: "handicap",
        courseName: "Lingfield",
        going: "Good to Firm",
      }),
      false,
    );
  });

  test("identifies ordinary Flat Turf races for Turf speed display", () => {
    assert.equal(
      isOrdinaryFlatTurfRaceForDisplay({
        raceName: "Nua Healthcare Handicap",
        raceType: "handicap",
        courseName: "Curragh",
        going: "Good",
      }),
      true,
    );
    assert.equal(
      isOrdinaryFlatTurfRaceForDisplay({
        raceName: "Irish Stallion Farms EBF Mares Flat Race",
        raceType: "",
        courseName: "Naas",
        going: "Soft",
      }),
      false,
    );
  });

  test("formats the racing date without substituting another date", () => {
    assert.equal(formatRacingDate("2026-09-09"), "Wednesday 9 September 2026");
  });

  test("converts UK BST race times from the absolute race instant", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-09-16T12:45:00.000Z"),
        scheduledTime: "12:45:00",
        courseCountry: "ENG",
      }),
      "13:45",
    );
  });

  test("keeps a 14:00 UK BST clock as 14:00 from a 13:00Z race instant", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-09-15T13:00:00.000Z"),
        scheduledTime: "13:00:00",
        courseCountry: "ENG",
      }),
      "14:00",
    );
  });

  test("keeps non-whole-hour UK BST race times from the race instant", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-09-15T12:53:00.000Z"),
        scheduledTime: "12:53:00",
        courseCountry: "ENG",
      }),
      "13:53",
    );
  });

  test("keeps UK winter race times on GMT", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-12-16T12:45:00.000Z"),
        scheduledTime: "13:00:00",
        courseCountry: "ENG",
      }),
      "12:45",
    );
  });

  test("displays Irish BST race times with the Dublin timezone", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-09-16T12:45:00.000Z"),
        scheduledTime: "12:45:00",
        courseCountry: "EIRE",
      }),
      "13:45",
    );
  });

  test("formats the 2026-09-25 Listowel UTC instant as 17:40 Irish local time", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-09-25T16:40:00.000Z"),
        scheduledTime: "16:40:00",
        courseCountry: "IRE",
      }),
      "17:40",
    );
  });

  test("does not apply a summer offset to an Irish GMT race", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-12-12T16:40:00.000Z"),
        scheduledTime: "16:40:00",
        courseCountry: "IRE",
      }),
      "16:40",
    );
  });

  test("displays Northern Irish summer race times with the UK timezone", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-09-18T12:37:00.000Z"),
        scheduledTime: "12:37:00",
        courseCountry: "Nort",
      }),
      "13:37",
    );
  });

  test("race time display is independent of the server timezone", () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      assert.equal(
        formatRaceTimeForDisplay({
          raceDateTime: new Date("2026-09-16T12:45:00.000Z"),
          scheduledTime: "12:45:00",
          courseCountry: "ENG",
        }),
        "13:45",
      );
    } finally {
      if (previousTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTimezone;
      }
    }
  });

  test("falls back to Europe/London formatting when no scheduled time exists", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: new Date("2026-09-12T15:00:00.000Z"),
        scheduledTime: null,
      }),
      "16:00",
    );
  });

  test("falls back to stored scheduled time when no race datetime exists", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: null,
        scheduledTime: "14:05:00",
      }),
      "14:05",
    );
  });

  test("falls back to placeholder when no display time exists", () => {
    assert.equal(
      formatRaceTimeForDisplay({
        raceDateTime: null,
        scheduledTime: null,
      }),
      "--:--",
    );
  });
});

function row(overrides: Partial<TodayRacecardRow> = {}): TodayRacecardRow {
  return {
    raceId: "race-1",
    raceSourceId: "937435",
    raceDate: "2026-09-09",
    raceDateTime: new Date("2026-09-09T12:40:00.000Z"),
    scheduledTime: "13:40:00",
    raceName: "Carlisle Novice",
    raceClass: "4",
    raceType: "novice",
    raceTypeCode: null,
    distance: "5f 182y",
    distanceYards: 1282,
    going: "Good",
    surface: "TURF",
    declaredRunnerCount: 2,
    actualRunnerCount: null,
    winningTime: null,
    courseId: "course-carlisle",
    courseSourceId: "302",
    courseName: "Carlisle",
    country: "ENG",
    runnerId: "runner-1",
    runnerSourceId: "ride-1",
    horseId: "horse-1",
    horseName: "First",
    saddleclothNumber: 1,
    horseAge: 2,
    horseSex: "f",
    weight: "9-2",
    weightCarriedLbs: 128,
    draw: 6,
    jockeyName: "A Jockey",
    trainerId: "trainer-1",
    trainerName: "A Trainer",
    officialRating: 82,
    odds: "6/1",
    oddsDecimal: null,
    resultStatus: null,
    finishingPosition: null,
    ...overrides,
  };
}

function quote(decimalOdds: number, fractionalOdds: string | null, bookmakerName = "Book", bookmakerId = 1) {
  return { bookmakerId, bookmakerName, fractionalOdds, decimalOdds };
}

function bookmakerOdds(decimalOdds: number, fractionalOdds: string) {
  return [quote(decimalOdds, fractionalOdds)];
}

function metric(
  overrides: Partial<HorseMetricsAsOf> = {},
): HorseMetricsAsOf {
  return {
    priorRuns: 1,
    priorWins: 0,
    priorPlaces: 1,
    winPercentage: 0,
    placePercentage: 100,
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
    latestJumpSpeedRating: null,
    previousJumpSpeedRating: null,
    bestJumpSpeedLast3: null,
    bestJumpSpeedLast5: null,
    averageJumpSpeedLast3: null,
    averageJumpSpeedLast5: null,
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
    latestRunDate: "2026-09-01",
    daysSinceLastRun: 8,
    breakLengthDays: null,
    runAfterBreakNumber: null,
    runsAtCourse: 0,
    winsAtCourse: 0,
    placesAtCourse: 0,
    runsAtExactDistance: 0,
    winsAtExactDistance: 0,
    placesAtExactDistance: 0,
    runsOnGoing: 0,
    winsOnGoing: 0,
    placesOnGoing: 0,
    ...overrides,
  };
}

function indexPayload(courseIds: string[]) {
  return {
    props: {
      pageProps: {
        meetings: courseIds.map((courseId) => ({
          meeting_summary: {
            course: {
              course_reference: {
                id: courseId,
              },
            },
          },
        })),
      },
    },
  };
}

function currentCardIndexPayload(
  course: string,
  meetingId: string,
  races: Array<[sourceId: string, raceName: string]>,
) {
  return {
    props: {
      pageProps: {
        meetings: [{
          meeting_summary: {
            meeting_reference: { id: meetingId },
            course: { name: course, course_reference: { id: course } },
          },
          races: races.map(([sourceId, raceName]) => ({
            race_summary_reference: { id: sourceId },
            name: raceName,
          })),
        }],
      },
    },
  };
}
