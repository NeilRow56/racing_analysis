import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMENT_FEATURE_NAMES, NUMERIC_FEATURES, type HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";
import type { TodayRace, TodayRunner } from "./todays-racing";
import { formatRaceTimeForDisplay, sportingLifeEstimatedPriceFromRacecard } from "./todays-racing";
import {
  TISSUE_FORWARD_START,
  TISSUE_FORWARD_VERSION,
  TISSUE_MODEL_VERSION,
  TISSUE_V2_CONFIG,
  buildTissueForwardRace,
  compareTissueWithTimewise,
  enrichTissueForwardRace,
  summarizeTissueForward,
  upsertTissueRaces,
  loadFrozenTissueModel,
  loadTissueForward,
  parseSportingLifeEstimatedPrice,
  pendingCleanPreRaceTissueRaceIds,
  renderTissueTodayReport,
  settlePendingTissueForwardRaces,
  tissueEstimatedPriceComparison,
  type FrozenTissueModel,
  type TissueForwardData,
  type TissueForwardRace,
} from "./tissue-forward";

const model: FrozenTissueModel = {
  version: TISSUE_MODEL_VERSION,
  trainedAt: "2026-09-19T00:00:00.000Z",
  trainingWindow: { from: "2025-01-01", to: "2025-12-31" },
  checksum: "test",
  model: {
    names: [...NUMERIC_FEATURES.map(([name]) => name), ...NUMERIC_FEATURES.map(([name]) => `${name}_missing`), ...COMMENT_FEATURE_NAMES],
    means: Array(NUMERIC_FEATURES.length * 2 + COMMENT_FEATURE_NAMES.length).fill(0),
    scales: Array(NUMERIC_FEATURES.length * 2 + COMMENT_FEATURE_NAMES.length).fill(1),
    weights: Array(NUMERIC_FEATURES.length * 2 + COMMENT_FEATURE_NAMES.length).fill(0),
  },
};

describe("independent tissue forward tracker", () => {
  test("creates a 100% pre-race book without reading market values", () => {
    const race = sampleRace();
    race.runners[0]!.oddsDecimal = "1.01";
    const record = buildTissueForwardRace({ raceDate: TISSUE_FORWARD_START, course: "Newbury", race, model, commentsByHorse: new Map(), recordedAt: new Date("2026-09-19T11:00:00Z") })!;
    assert.ok(Math.abs(record.runners.reduce((sum, runner) => sum + runner.probability, 0) - 1) < 1e-12);
    assert.deepEqual(record.runners.map((runner) => runner.probability), [0.5, 0.5]);
    assert.equal(record.recordedPreRace, true);
    assert.ok(record.runners.every((runner) => runner.finalSp === null && runner.marketRank === null));
  });

  test("uses strictly earlier comments and rejects historical clean backfill", () => {
    const comments = new Map<string, HistoricalComment[]>([["horse-1", [
      { raceId: "prior", raceDate: "2026-09-01", raceDateTime: new Date("2026-09-01T12:00:00Z"), comment: "slowly away" },
      { raceId: "target", raceDate: TISSUE_FORWARD_START, raceDateTime: new Date("2026-09-19T13:00:00Z"), comment: "hampered" },
      { raceId: "future", raceDate: "2026-09-20", raceDateTime: new Date("2026-09-20T13:00:00Z"), comment: "led" },
    ]]]);
    assert.equal(buildTissueForwardRace({ raceDate: "2026-09-18", course: "Newbury", race: sampleRace(), model, commentsByHorse: comments }), null);
    const record = buildTissueForwardRace({ raceDate: TISSUE_FORWARD_START, course: "Newbury", race: sampleRace(), model, commentsByHorse: comments, recordedAt: new Date("2026-09-19T11:00:00Z") })!;
    assert.deepEqual(record.runners[0]!.commentFeatures, ["slowlyAway"]);
  });

  test("enriches results without changing the frozen tissue and remains idempotent", () => {
    const race = sampleRace();
    const record = buildTissueForwardRace({ raceDate: TISSUE_FORWARD_START, course: "Newbury", race, model, commentsByHorse: new Map(), recordedAt: new Date("2026-09-19T11:00:00Z") })!;
    const original = record.runners.map(({ probability, fairDecimalOdds, tissueRank }) => ({ probability, fairDecimalOdds, tissueRank }));
    race.runners[0]!.finishingPosition = 1;
    race.runners[0]!.oddsDecimal = "4";
    race.runners[1]!.finishingPosition = 2;
    race.runners[1]!.oddsDecimal = "2";
    const enriched = enrichTissueForwardRace(record, race, new Date("2026-09-19T14:00:00Z"));
    assert.deepEqual(enriched.runners.map(({ probability, fairDecimalOdds, tissueRank }) => ({ probability, fairDecimalOdds, tissueRank })), original);
    assert.deepEqual(enriched.winners, ["Alpha"]);
    assert.equal(enriched.runners[0]!.marketRank, 2);
    assert.strictEqual(enrichTissueForwardRace(enriched, race), enriched);
  });

  test("deduplicates capture and summarizes pending, settled, calibration and Timewise", () => {
    const race = sampleRace();
    const record = buildTissueForwardRace({ raceDate: TISSUE_FORWARD_START, course: "Newbury", race, model, commentsByHorse: new Map(), recordedAt: new Date("2026-09-19T11:00:00Z") })!;
    let data = emptyData();
    data = upsertTissueRaces(data, [record, record]);
    assert.equal(data.races.length, 1);
    race.runners[0]!.finishingPosition = 1;
    race.runners[0]!.oddsDecimal = "4";
    race.runners[1]!.finishingPosition = 2;
    race.runners[1]!.oddsDecimal = "2";
    data.races[0] = enrichTissueForwardRace(record, race);
    const summary = summarizeTissueForward(data);
    assert.equal(summary.cleanPreRaceRaces, 1);
    assert.equal(summary.pending, 0);
    assert.equal(summary.top1, 1);
    assert.ok(Number.isFinite(summary.logLoss));
    assert.equal(summary.calibration.reduce((sum, band) => sum + band.runners, 0), 2);
    assert.equal(compareTissueWithTimewise(data, [{ raceDate: TISSUE_FORWARD_START, course: "Newbury", raceTime: "13:00", timewiseRank1: "Beta", winners: [{ horseName: "Alpha" }] }]).tissueOnly, 1);
  });

  test("settles a prior-day pending clean pre-race record from batched race results", () => {
    const pending = reportRace({
      raceDate: "2026-09-25",
      raceId: "race-1",
      runners: [reportRunner("Alpha", 1, 0.6), reportRunner("Beta", 2, 0.4)],
    });
    const frozen = pending.runners.map(({ probability, fairDecimalOdds, tissueRank }) => ({ probability, fairDecimalOdds, tissueRank }));
    const resultRace = sampleRace();
    resultRace.runners[0]!.finishingPosition = 1;
    resultRace.runners[0]!.oddsDecimal = "3";
    resultRace.runners[1]!.finishingPosition = 2;
    resultRace.runners[1]!.oddsDecimal = "5";

    const settled = settlePendingTissueForwardRaces(
      { ...emptyData(), races: [pending] },
      new Map([[resultRace.raceId, resultRace]]),
      new Date("2026-09-26T10:00:00.000Z"),
    );

    assert.equal(settled.settled, 1);
    assert.deepEqual(settled.data.races[0]!.winners, ["Alpha"]);
    assert.equal(settled.data.races[0]!.settledAt, "2026-09-26T10:00:00.000Z");
    assert.deepEqual(settled.data.races[0]!.runners.map(({ probability, fairDecimalOdds, tissueRank }) => ({ probability, fairDecimalOdds, tissueRank })), frozen);
  });

  test("leaves a current-day future clean pre-race record pending when no winner is available", () => {
    const pending = reportRace({ raceDate: "2026-09-26", raceId: "race-1" });
    const result = settlePendingTissueForwardRaces(
      { ...emptyData(), races: [pending] },
      new Map([[sampleRace().raceId, sampleRace()]]),
    );

    assert.equal(result.settled, 0);
    assert.equal(result.data.races[0]!.winners.length, 0);
    assert.equal(result.data.races[0]!.settledAt, null);
  });

  test("settling pending Tissue races is idempotent", () => {
    const pending = reportRace({ raceId: "race-1", runners: [reportRunner("Alpha", 1, 0.5), reportRunner("Beta", 2, 0.5)] });
    const resultRace = sampleRace();
    resultRace.runners[1]!.finishingPosition = 1;
    resultRace.runners[1]!.oddsDecimal = "2";
    resultRace.runners[0]!.finishingPosition = 2;
    resultRace.runners[0]!.oddsDecimal = "4";

    const first = settlePendingTissueForwardRaces({ ...emptyData(), races: [pending] }, new Map([[resultRace.raceId, resultRace]]));
    const firstBytes = JSON.stringify(first.data);
    const second = settlePendingTissueForwardRaces(first.data, new Map([[resultRace.raceId, resultRace]]));

    assert.equal(first.settled, 1);
    assert.equal(second.settled, 0);
    assert.equal(JSON.stringify(second.data), firstBytes);
  });

  test("post-race backfilled Tissue records stay excluded during settlement", () => {
    const backfilled = reportRace({
      raceId: "race-1",
      recordedPreRace: false,
      runners: [reportRunner("Alpha", 1, 0.5), reportRunner("Beta", 2, 0.5)],
    });
    const resultRace = sampleRace();
    resultRace.runners[0]!.finishingPosition = 1;

    const result = settlePendingTissueForwardRaces(
      { ...emptyData(), races: [backfilled] },
      new Map([[resultRace.raceId, resultRace]]),
    );
    const summary = summarizeTissueForward(result.data);

    assert.equal(result.settled, 0);
    assert.equal(result.data.races[0]!.recordedPreRace, false);
    assert.deepEqual(result.data.races[0]!.winners, []);
    assert.equal(summary.postRaceBackfilledExcluded, 1);
  });

  test("records non-runners while settling with canonical result enrichment", () => {
    const pending = reportRace({ raceId: "race-1", runners: [reportRunner("Alpha", 1, 0.6), reportRunner("Beta", 2, 0.4)] });
    const resultRace = sampleRace();
    resultRace.runners[0]!.resultStatus = "non_runner";
    resultRace.runners[1]!.finishingPosition = 1;
    resultRace.runners[1]!.oddsDecimal = "2.5";

    const result = settlePendingTissueForwardRaces(
      { ...emptyData(), races: [pending] },
      new Map([[resultRace.raceId, resultRace]]),
    );

    assert.equal(result.settled, 1);
    assert.deepEqual(result.data.races[0]!.winners, ["Beta"]);
    assert.equal(result.data.races[0]!.runners[0]!.finishingPosition, null);
    assert.equal(result.data.races[0]!.runners[0]!.finalSp, null);
    assert.equal(result.data.races[0]!.runners[0]!.tissueRank, 1);
  });

  test("pending clean pre-race IDs exclude settled and post-race backfilled records", () => {
    assert.deepEqual(pendingCleanPreRaceTissueRaceIds({ ...emptyData(), races: [
      reportRace({ raceId: "pending", recordedPreRace: true }),
      reportRace({ raceId: "settled", recordedPreRace: true, winners: ["Winner"], settledAt: "2026-09-25T14:00:00.000Z" }),
      reportRace({ raceId: "backfilled", recordedPreRace: false }),
    ] }), ["pending"]);
  });

  test("keeps v2 isolated and starts only at the frozen implementation timestamp", async () => {
    const v2Model: FrozenTissueModel = { ...model, version: TISSUE_V2_CONFIG.modelVersion };
    const beforeStart = sampleRace();
    beforeStart.raceDateTime = new Date("2026-09-19T17:00:00Z");
    assert.equal(buildTissueForwardRace({ raceDate: "2026-09-19", course: "Newbury", race: beforeStart, model: v2Model, commentsByHorse: new Map(), config: TISSUE_V2_CONFIG }), null);

    const afterStart = sampleRace();
    afterStart.raceDateTime = new Date("2026-09-19T18:00:00Z");
    const record = buildTissueForwardRace({ raceDate: "2026-09-19", course: "Newbury", race: afterStart, model: v2Model, commentsByHorse: new Map(), recordedAt: new Date(TISSUE_V2_CONFIG.forwardStartAt!), config: TISSUE_V2_CONFIG });
    assert.equal(record?.tissueModelVersion, TISSUE_V2_CONFIG.modelVersion);
    assert.ok(Math.abs(record!.runners.reduce((sum, runner) => sum + runner.probability, 0) - 1) < 1e-12);

    const directory = await mkdtemp(join(tmpdir(), "tissue-v2-test-"));
    try {
      const modelPath = join(directory, "model.json");
      const trackerPath = join(directory, "forward.json");
      await writeFile(modelPath, JSON.stringify(v2Model));
      await writeFile(trackerPath, JSON.stringify({ version: TISSUE_FORWARD_VERSION, tissueModelVersion: TISSUE_MODEL_VERSION, forwardStart: TISSUE_FORWARD_START, races: [] }));
      assert.equal((await loadFrozenTissueModel(modelPath, TISSUE_V2_CONFIG.modelVersion)).version, TISSUE_V2_CONFIG.modelVersion);
      await assert.rejects(loadTissueForward(trackerPath, TISSUE_V2_CONFIG), /Unsupported tissue forward data/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("renders the latest clean date with ordered pending and settled top-three selections", () => {
    const older = reportRace({ raceDate: "2026-09-24", raceId: "older", raceName: "Older Race", raceTime: "16:00" });
    const backfilled = reportRace({ raceId: "backfilled", raceName: "Backfilled Race", raceTime: "12:00", recordedPreRace: false });
    const settled = reportRace({
      raceId: "settled",
      raceTime: "13:30",
      course: "Ascot",
      raceName: "September Stakes",
      runners: [
        reportRunner("Rank Three", 3, 0.1, 3, 8),
        reportRunner("Withdrawn Favourite", 1, 0.4, null, null),
        reportRunner("Race Winner", 2, 0.25, 1, 4),
      ],
      winners: ["Race Winner"],
      settledAt: "2026-09-25T14:00:00.000Z",
    });
    const pending = reportRace({
      raceId: "pending",
      raceTime: "14:10",
      course: "Newmarket",
      raceName: "Example Stakes",
      runners: [
        reportRunner("Third Choice", 3, 0.12),
        reportRunner("First Choice", 1, 0.32),
        reportRunner("Second Choice", 2, 0.2),
      ],
    });
    const output = renderTissueTodayReport(
      { ...emptyData(), races: [pending, older, backfilled, settled] },
      [
        estimatedPrice("pending", "First Choice", "5/1", "6.000"),
        estimatedPrice("pending", "Second Choice", "7/2", "4.500"),
        estimatedPrice("pending", "Third Choice", null, null),
        estimatedPrice("settled", "Race Winner", "1/2", "1.500"),
      ],
    );

    assert.match(output, /^Tissue Today - 2026-09-25/);
    assert.equal(output.includes("Older Race"), false);
    assert.equal(output.includes("Backfilled Race"), false);
    assert.ok(output.indexOf("13:30 Ascot") < output.indexOf("14:10 Newmarket"));
    assert.ok(output.indexOf("1. First Choice") < output.indexOf("2. Second Choice"));
    assert.ok(output.indexOf("2. Second Choice") < output.indexOf("3. Third Choice"));
    assert.match(output, /1\. Withdrawn Favourite - non-runner\n   Tissue 40\.0% \| Est SP: —/);
    assert.match(output, /1\. First Choice\n   Tissue 32\.0% \| Est SP 5\/1 \| Market 16\.7% \| Edge \+15\.3pp \| VALUE/);
    assert.match(output, /2\. Second Choice\n   Tissue 20\.0% \| Est SP 7\/2 \| Market 22\.2% \| Edge -2\.2pp/);
    assert.doesNotMatch(output, /Edge -2\.2pp \| VALUE/);
    assert.match(output, /3\. Third Choice\n   Tissue 12\.0% \| Est SP: —/);
    assert.match(output, /Current positive-edge Tissue rank-1 horses\n14:10 Newmarket - First Choice \| Tissue 32\.0% \| Est SP 5\/1 \| Edge \+15\.3pp/);
    assert.match(output, /Value comparison uses the current Sporting Life estimated SP and may change before the race\./);
    assert.match(output, /Status: settled - Tissue rank 1 non-runner - winner Race Winner \(Tissue rank 2\) - Tissue rank 1 won: no/);
    assert.match(output, /Status: pending/);
  });

  test("parses Sporting Life fractional and evens estimated prices", () => {
    assert.equal(parseSportingLifeEstimatedPrice("5/1"), 6);
    assert.equal(parseSportingLifeEstimatedPrice("7/2"), 4.5);
    assert.equal(parseSportingLifeEstimatedPrice("11/4"), 3.75);
    assert.equal(parseSportingLifeEstimatedPrice("Evens"), 2);
    assert.equal(parseSportingLifeEstimatedPrice("EVS"), 2);
    assert.equal(parseSportingLifeEstimatedPrice("not available"), null);
  });

  test("compares frozen Tissue probability with current market probability", () => {
    const positive = tissueEstimatedPriceComparison(0.25, "5/1");
    const negative = tissueEstimatedPriceComparison(0.1, "5/1");

    assert.deepEqual(positive, {
      estimatedSp: "5/1",
      decimalOdds: 6,
      marketProbability: 1 / 6,
      edge: 0.25 - (1 / 6),
      isValue: true,
    });
    assert.equal(negative?.isValue, false);
    assert.ok((negative?.edge ?? 0) < 0);
    assert.equal(tissueEstimatedPriceComparison(0.25, null), null);
  });

  test("changing the current price does not alter the frozen Tissue probability", () => {
    const data = { ...emptyData(), races: [reportRace({
      raceId: "price-change",
      runners: [reportRunner("Frozen Selection", 1, 0.25)],
    })] };
    const frozenBefore = JSON.stringify(data);
    const shortPrice = renderTissueTodayReport(data, [estimatedPrice("price-change", "Frozen Selection", "2/1", "3.000")]);
    const longPrice = renderTissueTodayReport(data, [estimatedPrice("price-change", "Frozen Selection", "9/1", "10.000")]);

    assert.match(shortPrice, /Tissue 25\.0% \| Est SP 2\/1 \| Market 33\.3% \| Edge -8\.3pp/);
    assert.match(longPrice, /Tissue 25\.0% \| Est SP 9\/1 \| Market 10\.0% \| Edge \+15\.0pp \| VALUE/);
    assert.equal(data.races[0]!.runners[0]!.probability, 0.25);
    assert.equal(JSON.stringify(data), frozenBefore);
  });

  test("uses Today's canonical local race time for the Tissue report", () => {
    const race = reportRace({
      raceId: "listowel-1740",
      course: "Listowel",
      raceTime: "16:40",
      runners: [reportRunner("Irish Runner", 1, 0.25)],
    });
    const context = sportingLifeEstimatedPriceFromRacecard({
      raceId: race.raceId,
      runnerId: race.runners[0]!.runnerId,
      estimatedSp: "5/1",
      estimatedDecimalOdds: "6.000",
      scheduledTime: "16:40:00",
      raceDateTime: new Date("2026-09-25T16:40:00.000Z"),
      courseCountry: "IRE",
    });
    const todayTime = formatRaceTimeForDisplay({
      scheduledTime: "16:40:00",
      raceDateTime: new Date("2026-09-25T16:40:00.000Z"),
      courseCountry: "IRE",
    });
    const output = renderTissueTodayReport({ ...emptyData(), races: [race] }, [context]);

    assert.equal(todayTime, "17:40");
    assert.equal(context.displayRaceTime, todayTime);
    assert.match(output, /17:40 Listowel/);
    assert.doesNotMatch(output, /16:40 Listowel/);
  });
});

function emptyData(): TissueForwardData { return { version: TISSUE_FORWARD_VERSION, tissueModelVersion: TISSUE_MODEL_VERSION, forwardStart: TISSUE_FORWARD_START, races: [] }; }
function sampleRace(): TodayRace {
  return { raceId: "race-1", sourceId: "123", scheduledTime: "13:00:00", raceDateTime: new Date("2026-09-19T13:00:00Z"), courseCountry: "England", raceName: "Turf Handicap", raceClass: "Class 4", raceType: "Flat", raceTypeCode: "FLAT", distance: "1m", distanceYards: 1760, going: "Good", surface: "TURF", declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null, runners: [runner("1", "Alpha"), runner("2", "Beta")] };
}
function runner(id: string, name: string): TodayRunner {
  return { runnerId: `runner-${id}`, runnerSourceId: id, horseId: `horse-${id}`, horseName: name, saddleclothNumber: Number(id), horseAge: 4, horseSex: null, weight: "9-0", weightCarriedLbs: 126, draw: Number(id), jockeyName: null, trainerId: null, trainerName: null, officialRating: 80, odds: null, oddsDecimal: null, resultStatus: null, finishingPosition: null, metrics: null };
}

function reportRace(overrides: Partial<TissueForwardRace> = {}): TissueForwardRace {
  return {
    raceDate: "2026-09-25",
    course: "Newmarket",
    raceTime: "14:00",
    raceId: "report-race",
    sourceId: "source",
    raceName: null,
    tissueModelVersion: TISSUE_V2_CONFIG.modelVersion,
    tissueModelChecksum: "checksum",
    recordedAt: "2026-09-25T10:00:00.000Z",
    recordedPreRace: true,
    runners: [reportRunner("Example", 1, 0.4)],
    winners: [],
    settledAt: null,
    ...overrides,
  };
}

function reportRunner(
  horseName: string,
  tissueRank: number,
  probability: number,
  finishingPosition: number | null = null,
  finalSp: number | null = null,
) {
  return {
    runnerId: `runner-${horseName}`,
    horseId: `horse-${horseName}`,
    horseName,
    probability,
    fairDecimalOdds: 1 / probability,
    tissueRank,
    commentFeatures: [],
    finishingPosition,
    finalSp,
    marketImpliedProbability: finalSp === null ? null : 1 / finalSp,
    marketRank: null,
  };
}

function estimatedPrice(
  raceId: string,
  horseName: string,
  estimatedSp: string | null,
  estimatedDecimalOdds: string | null,
) {
  return {
    raceId,
    runnerId: `runner-${horseName}`,
    estimatedSp,
    estimatedDecimalOdds,
    displayRaceTime: raceId === "pending" ? "14:10" : raceId === "settled" ? "13:30" : "14:00",
  };
}
