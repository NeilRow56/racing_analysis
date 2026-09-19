import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMENT_FEATURE_NAMES, NUMERIC_FEATURES, type HistoricalComment } from "../../../scripts/diagnose-independent-tissue-feasibility";
import type { TodayRace, TodayRunner } from "./todays-racing";
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
  type FrozenTissueModel,
  type TissueForwardData,
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
});

function emptyData(): TissueForwardData { return { version: TISSUE_FORWARD_VERSION, tissueModelVersion: TISSUE_MODEL_VERSION, forwardStart: TISSUE_FORWARD_START, races: [] }; }
function sampleRace(): TodayRace {
  return { raceId: "race-1", sourceId: "123", scheduledTime: "13:00:00", raceDateTime: new Date("2026-09-19T13:00:00Z"), courseCountry: "England", raceName: "Turf Handicap", raceClass: "Class 4", raceType: "Flat", raceTypeCode: "FLAT", distance: "1m", distanceYards: 1760, going: "Good", surface: "TURF", declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null, runners: [runner("1", "Alpha"), runner("2", "Beta")] };
}
function runner(id: string, name: string): TodayRunner {
  return { runnerId: `runner-${id}`, runnerSourceId: id, horseId: `horse-${id}`, horseName: name, saddleclothNumber: Number(id), horseAge: 4, horseSex: null, weight: "9-0", weightCarriedLbs: 126, draw: Number(id), jockeyName: null, trainerId: null, trainerName: null, officialRating: 80, odds: null, oddsDecimal: null, resultStatus: null, finishingPosition: null, metrics: null };
}
