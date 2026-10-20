import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { COMMENT_FEATURE_NAMES, NUMERIC_FEATURES, commentVector, numericVector, raceSoftmax, score } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { calculateHorseMetricsAsOf, type HistoricalRunInput } from "./horse-metrics";
import { buildTissueForwardRace, featureInput, loadFrozenTissueModel, ACTIVE_TURF_TISSUE_CONFIG, TISSUE_V3_CONFIG, TISSUE_V3_MODEL_VERSION, TISSUE_V3_LIVE_SEMANTICS_VERSION, TISSUE_V3_EPOCH, TISSUE_V1_CONFIG, TISSUE_V2_CONFIG, TURF_TISSUE_LIVE_SEMANTICS_EPOCH, TURF_TISSUE_LIVE_SEMANTICS_VERSION, upsertTissueRaces } from "./tissue-forward";
import type { TodayRace, TodayRunner } from "./todays-racing";
import { declarationOnlyTurfFeatures } from "./turf-tissue-training-semantics";

const cutoff = new Date("2026-10-20T14:00:00Z");
const indexes = [1, 2, 3, 7, 8, 9];
const artifact = await loadFrozenTissueModel(TISSUE_V2_CONFIG.modelPath, TISSUE_V2_CONFIG.modelVersion);
function run(family: "turf" | "aw" | "jump", day: number, rating: number, weight: number | null = 140): HistoricalRunInput {
  const speed = { rating, method: "same_day", confidence: "high", baseRating: rating, sameDayAdjustedRating: rating, cumulativeBeatenLengths: 0, standardSampleSize: 8, sameDaySampleSize: 3, unavailableReason: null, withheldReason: null, standardSeconds: 100, equivalentTimeSeconds: 99, secondsPerLength: .15 } as const;
  return { horseId: "horse-1", courseId: "course", raceDate: `2026-10-${String(day).padStart(2, "0")}`, raceDateTime: new Date(`2026-10-${String(day).padStart(2, "0")}T14:00:00Z`), distanceYards: 1760, going: "Good", finishingPosition: 2, resultStatus: "finished", racingPostRating: null, topspeedRating: null, officialRating: null, weightCarriedLbs: weight,
    turfSpeedRating: family === "turf" ? { ...speed, calculationVersion: "turf_speed_v2" } : null,
    awSpeedRating: family === "aw" ? { ...speed, calculationVersion: "aw_speed_v1" } : null,
    jumpSpeedRating: family === "jump" ? { ...speed, calculationVersion: "jump_speed_v1" } : null };
}
function runner(runs: HistoricalRunInput[], targetWeight: number | null = 130): TodayRunner {
  return { runnerId: "runner-1", runnerSourceId: "1", horseId: "horse-1", horseName: "Mixed form", saddleclothNumber: 1, horseAge: 4, horseSex: null, weight: null, weightCarriedLbs: targetWeight, draw: 2, jockeyName: null, trainerId: null, trainerName: null, officialRating: 80, odds: null, oddsDecimal: null, resultStatus: null, finishingPosition: null,
    metrics: calculateHorseMetricsAsOf({ runs, beforeDateTime: cutoff, targetWeightCarriedLbs: targetWeight }) };
}
function race(first = runner([])): TodayRace {
  return { raceId: "race", sourceId: "1", scheduledTime: "14:00", raceDateTime: cutoff, courseCountry: "GB", raceName: "Turf Handicap", raceClass: "4", raceType: "flat", raceTypeCode: "FLAT", distance: "1m", distanceYards: 1760, going: "Good", surface: "Turf", declaredRunnerCount: 4, actualRunnerCount: null, winningTime: null,
    runners: [first, { ...runner([]), runnerId: "runner-2", horseId: "horse-2", horseName: "No form", draw: 1 }] };
}
function values(r: TodayRunner) { return numericVector(featureInput(race(r), r)); }
function assertRatings(r: TodayRunner, expected: (number | null)[]) {
  const vector = values(r);
  indexes.forEach((index, i) => {
    assert.equal(vector[index], expected[i] ?? 0, artifact.model.names[index]);
    assert.equal(vector[index + 26], expected[i] === null ? 1 : 0, artifact.model.names[index + 26]);
  });
}

test("all six rating inputs use older Turf instead of recent AW/Jump history", () => {
  const r = runner([run("aw", 19, 200), run("turf", 18, 100), run("turf", 17, 80), run("turf", 16, 300)]);
  assertRatings(r, [72, 72, 62, 110, 110, 100]);
  const perturbed = runner([run("aw", 19, 1000), run("turf", 18, 100), run("turf", 17, 80), run("turf", 16, 300)]);
  assert.deepEqual(values(perturbed), values(r));
  const jump = runner([run("jump", 19, 1000), run("turf", 18, 100), run("turf", 17, 80), run("turf", 16, 300)]);
  assert.deepEqual(values(jump), values(r));
  assert.equal(r.metrics!.latestPerformanceRating, 172);
});

test("non-Turf runs occupy L3 slots; latest can use Turf older than that window", () => {
  assertRatings(runner([run("aw", 19, 200), run("jump", 18, 180), run("aw", 17, 160), run("turf", 16, 100)]), [72, null, null, 110, null, null]);
});

test("all six flags stay missing with AW/Jump-only history or absent metrics", () => {
  assertRatings(runner([run("aw", 19, 200), run("jump", 18, 180)]), [null, null, null, null, null, null]);
  assertRatings({ ...runner([]), metrics: null }, [null, null, null, null, null, null]);
});

test("zero is available for all six ratings, never a missing value", () => {
  assertRatings(runner([run("turf", 18, 28)], 168), [0, 0, 0, 0, 0, 0]);
});

test("missing historical weight invalidates Turf performance and Today; target weight only invalidates Today", () => {
  assertRatings(runner([run("aw", 19, 200), run("turf", 18, 100, null)]), [null, null, null, null, null, null]);
  assertRatings(runner([run("turf", 18, 100)], null), [72, 72, 72, null, null, null]);
});

test("target/future/non-runner Turf starts never supply a live rating", () => {
  assertRatings(runner([run("turf", 20, 300), run("turf", 21, 300), { ...run("turf", 19, 300), resultStatus: "non_runner" }, run("aw", 18, 200)]), [null, null, null, null, null, null]);
});

test("both count columns use declarations and cannot read target result-list cardinality", () => {
  const r = runner([]), card = race(r);
  card.actualRunnerCount = 2;
  const v = numericVector(featureInput(card, r));
  assert.equal(v[20], 4);
  assert.equal(v[22], .5);
  assert.equal(v[46], 0);
  assert.equal(v[48], 0);
  assert.deepEqual(v, numericVector(featureInput({ ...card, actualRunnerCount: 99 }, r)));
  const missing = numericVector(featureInput({ ...card, declaredRunnerCount: null }, r));
  assert.equal(missing[20], 0);
  assert.equal(missing[22], 0);
  assert.equal(missing[46], 1);
  assert.equal(missing[48], 1);
  const noDraw = numericVector(featureInput(card, { ...r, draw: null }));
  assert.equal(noDraw[48], 1);
  const zeroDraw = numericVector(featureInput(card, { ...r, draw: 0 }));
  assert.equal(zeroDraw[22], 0);
  assert.equal(zeroDraw[48], 0);
  const zeroCount = numericVector(featureInput({ ...card, declaredRunnerCount: 0 }, r));
  assert.equal(zeroCount[20], 0);
  assert.equal(zeroCount[46], 0);
  assert.equal(zeroCount[48], 1);
});

test("only the confirmed columns differ; v1 adapter remains unchanged", () => {
  const r = runner([run("aw", 19, 200), run("turf", 18, 100)]);
  const card = { ...race(r), actualRunnerCount: 2 };
  const old = numericVector(featureInput(card, r, false));
  const fixed = numericVector(featureInput(card, r));
  const allowed = new Set([...indexes, ...indexes.map(i => i + 26), 20, 22, 46, 48]);
  fixed.forEach((v, i) => { if (!allowed.has(i)) assert.equal(v, old[i], artifact.model.names[i]); });
  assert.equal(old[1], 172);
  assert.equal(old[20], 2);
  assert.equal(old[22], 1);
});

test("public v2 scorer uses the corrected vector, fixed scaling and unchanged softmax/ranks", () => {
  const card = race(runner([run("aw", 19, 200), run("turf", 18, 100)]));
  const record = buildTissueForwardRace({ race: card, course: "Test", raceDate: "2026-10-20", model: artifact, commentsByHorse: new Map(), config: TISSUE_V2_CONFIG, recordedAt: new Date("2026-10-20T08:00:00Z") })!;
  const expected = raceSoftmax(card.runners.map(r => score(artifact.model, [...numericVector(featureInput(card, r)), ...commentVector([])])));
  assert.deepEqual(record.runners.map(r => r.probability), expected);
  assert.deepEqual(record.runners.map(r => r.tissueRank), expected.map(p => [...expected].sort((a, b) => b - a).indexOf(p) + 1));
  assert.equal(record.liveSemanticsVersion, TURF_TISSUE_LIVE_SEMANTICS_VERSION);
  assert.equal(record.liveSemanticsEffectiveAt, TURF_TISSUE_LIVE_SEMANTICS_EPOCH);
  const legacy = { ...record, liveSemanticsVersion: undefined, liveSemanticsEffectiveAt: undefined };
  const data = { version: TISSUE_V2_CONFIG.forwardVersion, tissueModelVersion: artifact.version, forwardStart: TISSUE_V2_CONFIG.forwardStart, races: [legacy] };
  const before = JSON.stringify(data);
  assert.equal(upsertTissueRaces(data, [record]).races[0], legacy);
  assert.equal(JSON.stringify(data), before);
  const v1 = buildTissueForwardRace({ race: card, course: "Test", raceDate: "2026-10-20", model: artifact, commentsByHorse: new Map(), config: TISSUE_V1_CONFIG })!;
  assert.equal(v1.liveSemanticsVersion, undefined);
  const v1Expected = raceSoftmax(card.runners.map(r => score(artifact.model, [...numericVector(featureInput(card, r, false)), ...commentVector([])])));
  assert.deepEqual(v1.runners.map(r => r.probability), v1Expected);
});

test("v2 artifact bytes, all 95 names/order, means/scales/coefficients remain frozen", async () => {
  const bytes = await readFile(TISSUE_V2_CONFIG.modelPath);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "f1b66275360c0c6e37ab8f46ae448b35fbc251fd5147150e53a5573c5bebbfd3");
  assert.equal(artifact.model.names.length, 95);
  assert.deepEqual(artifact.model.names, [...NUMERIC_FEATURES.map(([name]) => name), ...NUMERIC_FEATURES.map(([name]) => `${name}_missing`), ...COMMENT_FEATURE_NAMES]);
  for (const key of ["means", "scales", "weights"] as const) assert.equal(artifact.model[key].length, 95);
});

test("separate refit and live adapter share declarations-only field-size/draw semantics", () => {
  const card = { ...race(), actualRunnerCount: 2 };
  const oldFeatures = featureInput(card, card.runners[0]!, false);
  const rebuilt = declarationOnlyTurfFeatures(oldFeatures);
  assert.equal(oldFeatures.actualRunnerCount, 2);
  assert.equal(rebuilt.actualRunnerCount, null);
  assert.deepEqual(rebuilt, { ...oldFeatures, actualRunnerCount: null });
  const trainingVector = numericVector(rebuilt), liveVector = numericVector(featureInput(card, card.runners[0]!));
  for (const i of [20, 22, 46, 48]) assert.equal(trainingVector[i], liveVector[i]);
});

test("pure Turf history retains the entire original numeric vector on a fresh card", () => {
  const card = race(runner([run("turf", 19, 100), run("turf", 18, 80)]));
  for (const r of card.runners) assert.deepEqual(numericVector(featureInput(card, r)), numericVector(featureInput(card, r, false)));
});

const v3 = await loadFrozenTissueModel(TISSUE_V3_CONFIG.modelPath, TISSUE_V3_MODEL_VERSION);
const capturedAt = new Date("2026-10-20T08:00:00Z");
function v3Card(): TodayRace { return { ...race(runner([run("aw", 19, 200), run("turf", 18, 100)])), declaredRunnerCount: 2, turfTissueHistoryAsOf: capturedAt.toISOString() }; }
function v3Book(card = v3Card(), at = capturedAt, comments = new Map()) { return buildTissueForwardRace({ race: card, course: "Test", raceDate: "2026-10-20", model: v3, commentsByHorse: comments, config: TISSUE_V3_CONFIG, recordedAt: at }); }

test("v3 is the separately fitted canonical model, preserving all 95 feature names", () => {
  assert.equal(ACTIVE_TURF_TISSUE_CONFIG, TISSUE_V3_CONFIG);
  assert.notEqual(v3.checksum, artifact.checksum);
  assert.notEqual(TISSUE_V3_CONFIG.forwardPath, TISSUE_V2_CONFIG.forwardPath);
  assert.deepEqual(v3.model.names, artifact.model.names);
  const changedScalers = v3.model.names.filter((_, i) => v3.model.means[i] !== artifact.model.means[i] || v3.model.scales[i] !== artifact.model.scales[i]);
  assert.deepEqual(changedScalers, ["field_size", "draw_fraction"]);
  assert.equal(v3.specification?.fieldSizeSource, "declared_runner_count_only");
  assert.equal(v3.specification?.drawFractionDenominator, "declared_runner_count_only");
});

test("v3 freezes its actual 95-column inputs and capture cutoff for exact future replay", () => {
  const card = v3Card(), book = v3Book(card)!;
  assert.equal(book.liveSemanticsVersion, TISSUE_V3_LIVE_SEMANTICS_VERSION);
  assert.equal(book.liveSemanticsEffectiveAt, TISSUE_V3_EPOCH);
  assert.equal(book.featureCutoffAt, capturedAt.toISOString());
  const inputs = card.runners.map(r => [...numericVector(featureInput(card, r)), ...commentVector([])]);
  assert.deepEqual(book.runners.map(r => r.modelInputs), inputs);
  assert.deepEqual(book.runners.map(r => r.probability), raceSoftmax(inputs.map(v => score(v3.model, v))));
  assert.deepEqual(v3Book({ ...card, actualRunnerCount: 99 }), book);
});

test("v3 rejects post-off, result-bearing, incomplete and unbounded-history capture", () => {
  const card = v3Card();
  assert.equal(v3Book(card, cutoff), null);
  assert.equal(v3Book({ ...card, winningTime: "1m 40s" }), null);
  assert.equal(v3Book({ ...card, runners: card.runners.map((r, i) => i ? r : { ...r, finishingPosition: 1 }) }), null);
  assert.equal(v3Book({ ...card, runners: card.runners.map((r, i) => i ? r : { ...r, resultStatus: "finished" }) }), null);
  assert.equal(v3Book({ ...card, declaredRunnerCount: 3, actualRunnerCount: 2 }), null);
  assert.equal(v3Book({ ...card, turfTissueHistoryAsOf: undefined }), null);
  assert.equal(v3Book({ ...card, turfTissueHistoryAsOf: "2026-10-20T09:00:00Z" }), null);
  assert.equal(v3Book(card, new Date("2026-10-18T08:00:00Z")), null);
});

test("v3 excludes comments at/after capture even if they precede the target off", () => {
  const comments = new Map([["horse-1", [
    { raceId: "early", raceDate: "2026-10-20", raceDateTime: new Date("2026-10-20T07:00:00Z"), comment: "slowly away" },
    { raceId: "equal", raceDate: "2026-10-20", raceDateTime: capturedAt, comment: "hampered" },
    { raceId: "later", raceDate: "2026-10-20", raceDateTime: new Date("2026-10-20T09:00:00Z"), comment: "hampered" },
  ]]]);
  const book = v3Book(v3Card(), capturedAt, comments)!;
  assert.deepEqual(book.runners[0]!.commentFeatures, ["slowlyAway"]);
  assert.equal(book.runners[0]!.modelInputs![52], 1);
});

test("v3 refuses nonfinite feature vectors rather than persisting invalid probabilities", () => {
  const card = v3Card();
  card.runners[0]!.metrics!.latestTurfPerformanceRating = Number.NaN;
  assert.equal(v3Book(card), null);
});

test("v3 loader rejects tampered parameters and result-count semantics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "turf-v3-model-"));
  try {
    const path = join(directory, "model.json");
    const tampered = JSON.parse(await readFile(TISSUE_V3_CONFIG.modelPath, "utf8"));
    tampered.model.weights[0] += 1;
    await writeFile(path, JSON.stringify(tampered));
    await assert.rejects(loadFrozenTissueModel(path, TISSUE_V3_MODEL_VERSION), /Invalid Turf v3/);
    const unsafe = JSON.parse(await readFile(TISSUE_V3_CONFIG.modelPath, "utf8"));
    unsafe.specification.fieldSizeSource = "result_list_count";
    unsafe.checksum = createHash("sha256").update(JSON.stringify({ specification: unsafe.specification, model: unsafe.model })).digest("hex");
    await writeFile(path, JSON.stringify(unsafe));
    await assert.rejects(loadFrozenTissueModel(path, TISSUE_V3_MODEL_VERSION), /Invalid Turf v3/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
