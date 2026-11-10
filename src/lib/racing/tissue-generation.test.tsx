import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { TISSUE_GENERATION_EPOCH, tissueGenerationActive, retiredTissueCaptureAllowed } from "./tissue-generation-config";
import { GENERATION_FEATURES, generationCompletion, tissueGenerationFeatures, type TissueGenerationContext } from "./tissue-generation-features";
import { loadTissueGenerationModels, GENERATION_MODEL_VERSIONS, predictTissueGeneration } from "./tissue-generation-model";
import { appendTissueGeneration, emptyTissueGeneration, loadTissueGeneration, mutateTissueGeneration, settleTissueGeneration, summarizeTissueGeneration, attachTissueGeneration, validGenerationCapture, type GenerationRace } from "./tissue-generation-forward";
import { normalizeCompleteMarket } from "./tissue-value-metrics";
import { buildTissueGenerationRaces } from "./tissue-generation-sync";
import { TISSUE_V3_CONFIG, loadFrozenTissueModel, upsertTissueRaces, loadTissueForward } from "./tissue-forward";
import { loadAwV2Model } from "./aw-tissue-v2";
import { buildAwSurfaceFeatures } from "./aw-tissue-v2-features";
import { loadJumpTissueModel } from "./jump-tissue-model";
import { captureJumpTissueRaces, loadJumpTissueForward, settleJumpTissueRace } from "./jump-tissue-forward";
import { freezeChaseSpeedState } from "./chase-speed-reliability-capture";
import { buildHurdleRecencyObservations, loadHurdleRecency, appendHurdleRecency } from "./hurdle-recency-forward";
import { buildAllFamilyValueRaces } from "./tissue-value-capture";
import { VALUE_COHORTS } from "./tissue-value-config";
import { loadValueForward } from "./tissue-value-forward";
import { calculateHorseMetricsAsOf } from "./horse-metrics";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";
import { isTissue1Value1Agreement } from "./tissue-value-agreement";
import { FrozenRacecardRanks } from "../../app/racing/today/tissue-cells";
import { TissueGenerationMonitor } from "../../app/racing/research/forward-value/tissue-generation-monitor";
import { workflowSteps, runWorkflow } from "../../../scripts/run-research-workflow";

const now = new Date(Date.parse(TISSUE_GENERATION_EPOCH) + 1), date = TISSUE_GENERATION_EPOCH.slice(0, 10);
const off = new Date(now.getTime() + 6 * 3600000), after = new Date(off.getTime() + 1000);
const generationModels = await loadTissueGenerationModels();
const models = { turf: await loadFrozenTissueModel(TISSUE_V3_CONFIG.modelPath, TISSUE_V3_CONFIG.modelVersion), aw: await loadAwV2Model(), jump: await loadJumpTissueModel() };
function inputs() {
  const race = (family: typeof VALUE_COHORTS[number]["family"]): TodayRace => ({
    raceId: family, sourceId: family, raceName: family === "HURDLE" ? "Handicap Hurdle" : family === "CHASE" ? "Handicap Chase" : "Handicap Stakes",
    scheduledTime: off.toISOString().slice(11, 16), raceDateTime: off, turfTissueHistoryAsOf: now.toISOString(), raceClass: "4", raceType: family.toLowerCase(), raceTypeCode: null,
    surface: family === "AW" ? "ALLWEATHER" : family === "TURF" ? "Turf" : null, going: family === "AW" ? "Standard" : "Good",
    distance: "2m", distanceYards: 3520, courseCountry: "GB", declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null,
    runners: [1, 2].map((n): TodayRunner => ({ runnerId: `${family}-${n}`, runnerSourceId: null, horseId: `${family}-${n}`, horseName: `Horse ${n}`, horseAge: 5,
      horseSex: null, saddleclothNumber: n, weight: null, weightCarriedLbs: 140, draw: n, trainerId: null, trainerName: null, jockeyName: null, officialRating: 80,
      odds: "99/1", oddsDecimal: "100", forecastOdds: "99/1", forecastDecimalOdds: 100,
      resultStatus: null, finishingPosition: null, metrics: calculateHorseMetricsAsOf({ runs: [], beforeDateTime: now }),
      bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: null, decimalOdds: n + 2 }],
    })),
  });
  const meetings: TodayMeeting[] = [{ courseId: "course", courseSourceId: "course", country: "GB", order: 1, courseName: "Newcastle", races: VALUE_COHORTS.map(c => race(c.family)) }];
  const aw = meetings[0].races.find(r => r.raceId === "AW")!;
  const awContext = { historyCutoffAt: now.toISOString(), comments: new Map(), surfaceByRunner: new Map(aw.runners.map(r => [r.runnerId,
    buildAwSurfaceFeatures({ targetRaceId: aw.raceId, targetAt: off, historyCutoff: now, course: "Newcastle", surface: "ALLWEATHER", historyLoaded: true, priors: [] })])) };
  return { meetings, awContext, commentsByHorse: new Map(), models, generationModels, capturedAt: now, raceDate: date, historyCutoffAt: now.toISOString(),
    contexts: new Map(meetings[0].races.flatMap(r => r.runners.map((x): [string, TissueGenerationContext] => [x.runnerId, { completionPriors: [], usableJumpSpeedCount: 0 }]))) };
}
function capture() { return buildTissueGenerationRaces(inputs()); }
function result(book: GenerationRace, winners = 1): TodayRace {
  const race = inputs().meetings[0].races.find(r => r.raceId === book.raceId)!;
  return { ...race, actualRunnerCount: 2, runners: race.runners.map((r, i) => ({ ...r, oddsDecimal: "1000", resultStatus: "finished", finishingPosition: i < winners ? 1 : 2 })) };
}

test("family-specific frozen identities and exact Chase Shadow promotion", () => {
  for (const config of VALUE_COHORTS) {
    const model = generationModels[config.family];
    assert.equal(model.version, GENERATION_MODEL_VERSIONS[config.family]); assert.equal(model.prospectiveEpoch, TISSUE_GENERATION_EPOCH);
    assert.deepEqual(model.adjustment.names, GENERATION_FEATURES[config.family]);
  }
  const chase = generationModels.CHASE;
  assert.equal(chase.baseVersion, "CHASE_SHADOW_V1"); assert.equal(chase.baseChecksum, "ae956fa262be218f0574816c7607ef958b4221e6ae414432c1793744bea8a602");
  assert.equal(chase.development.contextRetained, false, "Reject context adjustment that worsens later-block log loss");
  assert.ok(chase.adjustment.weights.every(w => w === 0));
});

test("activation and capture are epoch-bound, current-day, pre-off, with no backfill", () => {
  assert.equal(tissueGenerationActive(new Date(Date.parse(TISSUE_GENERATION_EPOCH) - 1)), false);
  assert.equal(tissueGenerationActive(new Date(TISSUE_GENERATION_EPOCH)), true);
  const input = inputs(), books = buildTissueGenerationRaces(input);
  assert.equal(books.length, 4);
  assert.deepEqual(buildTissueGenerationRaces({ ...input, capturedAt: new Date(Date.parse(TISSUE_GENERATION_EPOCH) - 1) }), []);
  assert.equal(appendTissueGeneration(emptyTissueGeneration(), books, now).races.length, 4);
  assert.equal(appendTissueGeneration(emptyTissueGeneration(), books, after).races.length, 0);
  assert.equal(appendTissueGeneration(emptyTissueGeneration(), books, new Date(now.getTime() + 86400000)).races.length, 0);
  for (const book of books) assert.equal(book.modelVersion, GENERATION_MODEL_VERSIONS[book.family]);
});

test("Turf/AW Speed ranks, missingness and same-OR gap are genuinely field-relative", () => {
  for (const family of ["TURF", "AW"] as const) {
    const names = ["best_l3_turf_speed", "best_l3_turf_speed_missing", "official_rating", "official_rating_missing"];
    const rows = [110, 100, 90, null].map((speed, i) => ({ runnerId: String(i), modelInputs: [speed ?? 0, speed === null ? 1 : 0, 80, 0] }));
    const f = tissueGenerationFeatures({ family, raceId: "r", capturedAt: now.toISOString(), featureNames: names, runners: rows });
    assert.deepEqual(f.get("0"), [0, 0, 1.5]); assert.deepEqual(f.get("1"), [1, 0, 0]);
    assert.deepEqual(f.get("2"), [1, 0, -1.5]); assert.deepEqual(f.get("3"), [0, 1, 0]);
  }
});

test("Hurdle completion/PU features exclude target/future/NR/void and preserve canonical semantics", () => {
  const at = now.toISOString(), earlier = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();
  const prior = (raceId: string, days: number, resultStatus: string, finishingPosition: number | null = null) => ({ raceId, raceDateTime: earlier(days), resultStatus, finishingPosition });
  const history = [prior("target", 0, "finished", 1), prior("future", -1, "finished", 1), prior("nr", 1, "non_runner"), prior("void", 1, "void"),
    prior("pu", 20, "pulled_up"), prior("finish", 40, "finished", 3), prior("fall", 70, "fell")];
  assert.deepEqual(generationCompletion(history, "target", at, 20), [1, 1, 1 / 3, 0]);
  assert.deepEqual(generationCompletion(history, "target", at, 31), [0, 1, 1 / 3, 0]);
  assert.deepEqual(generationCompletion([], "target", at, null), [0, 0, 0, 1]);
  for (const status of ["fell", "unseated", "unseated_rider", "brought_down", "refused"]) assert.deepEqual(generationCompletion([prior(status, 20, status)], "target", at, 20), [1, 0, 0, 0]);
});

test("new probabilities produce frozen T1/T2 without altering old base vectors or Value outputs", () => {
  const input = inputs(), before = buildAllFamilyValueRaces(input), original = structuredClone(input.meetings);
  const books = buildTissueGenerationRaces(input);
  for (const book of books) {
    assert.ok(Math.abs(book.runners.reduce((s, r) => s + r.probability, 0) - 1) < 1e-12);
    assert.ok(book.runners.every(r => Number.isFinite(r.probability) && r.probability > 0));
    const ordered = [...book.runners].sort((a, b) => b.probability - a.probability || a.runnerId.localeCompare(b.runnerId));
    assert.equal(ordered[0].rank, 1);
    const source = book.runners.map(r => ({ runnerId: r.runnerId, modelInputs: r.modelInputs }));
    const sourceBefore = structuredClone(source);
    predictTissueGeneration(generationModels[book.family], { family: book.family, raceId: book.raceId, capturedAt: book.capturedAt, featureNames: book.featureNames, runners: source });
    assert.deepEqual(source, sourceBefore);
  }
  assert.deepEqual(buildAllFamilyValueRaces(input), before); assert.deepEqual(input.meetings, original);
});

test("clean tracker starts at zero and keeps monetary subset separate with no SP fallback", () => {
  for (const group of summarizeTissueGeneration(emptyTissueGeneration())) for (const row of group.rows) {
    assert.equal(row.captured, 0); assert.equal(row.settled, 0); assert.equal(row.profitLoss, null);
  }
  const input = inputs(); input.meetings[0].races[0].runners[0].bookmakerQuotes = [];
  const book = buildTissueGenerationRaces(input).find(r => r.family === "TURF")!;
  assert.equal(book.completeMarket, false); assert.ok(book.runners.every(r => r.capturedPrice === null));
  const data = settleTissueGeneration({ ...emptyTissueGeneration(), races: [book] }, new Map([[book.raceId, result(book)]]), after);
  const overall = summarizeTissueGeneration(data).find(g => g.rank === "TOP_2")!.rows.find(r => r.family === "ALL")!;
  assert.equal(overall.settled, 2); assert.equal(overall.winners, 1); assert.equal(overall.priceN, 0); assert.equal(overall.profitLoss, null);
  const html = renderToStaticMarkup(<TissueGenerationMonitor data={emptyTissueGeneration()} />);
  for (const label of ["TISSUE RANK 1", "TISSUE RANK 2", "TISSUE TOP 2", "Actual/model", "Price n", "not independent prospective validation", TISSUE_GENERATION_EPOCH]) assert.ok(html.includes(label), label);
});

test("canonical captured-price settlement is idempotent, handles dead heats/NR/void and ignores later odds", () => {
  const book = capture()[0], data = { ...emptyTissueGeneration(), races: [book] }, before = structuredClone(data);
  const settled = settleTissueGeneration(data, new Map([[book.raceId, result(book)]]), after);
  assert.equal(settled.races[0].runners[0].outcome!.profitLoss, 2);
  assert.deepEqual(settleTissueGeneration(settled, new Map([[book.raceId, result(book)]]), after), settled); assert.deepEqual(data, before);
  const dead = settleTissueGeneration(data, new Map([[book.raceId, result(book, 2)]]), after);
  assert.equal(dead.races[0].runners[0].outcome!.deadHeatDivisor, 2); assert.equal(dead.races[0].runners[0].outcome!.profitLoss, 1);
  for (const status of ["non_runner", "void"]) {
    const race = result(book); race.runners[0].resultStatus = status; race.runners[0].finishingPosition = null; race.runners[1].finishingPosition = 1; race.actualRunnerCount = 1;
    const ended = settleTissueGeneration(data, new Map([[book.raceId, race]]), after);
    assert.equal(ended.races[0].runners[0].outcome!.status, status === "non_runner" ? "NR" : "void");
    assert.equal(ended.races[0].runners[0].outcome!.profitLoss, null);
  }
});

test("new T1 drives agreement while Value 1 and original probabilities remain unchanged; absorbed badges disappear", () => {
  const value = { probability: .3, tissueRank: 1, valueRank: 1, activeValue1: true, valueSelectionVersion: "VALUE_RANK_V2" as const, marketPrice: 35, marketProbability: .02,
    marketRank: 10, modelMarketRatio: 15, family: "CHASE" as const, modelVersion: "JUMP_TISSUE_V1", valueTrackerVersion: "old", capturedAt: "2026-10-30T00:00:00Z",
    bestL3SpeedRank: 2, inputReliability: { level: "CAUTION" as const, reasons: ["Old research"] } };
  const before = structuredClone(value), activeTissue = { rank: 1, probability: .6, family: "CHASE", modelVersion: "CHASE_TISSUE_V2", capturedAt: now.toISOString() };
  const html = renderToStaticMarkup(<FrozenRacecardRanks runner={{ tissueValue: value, tissueGenerationActive: true, activeTissue }} shadowRank={1} />);
  assert.ok(html.includes(">T1=V1<")); assert.ok(html.includes("60.00% frozen"));
  for (const retired of ["border-red-200", "Tissue input data caution", "Shadow 1", "Shadow 2"]) assert.ok(!html.includes(retired), retired);
  assert.equal(isTissue1Value1Agreement({ ...value, activeTissueRank: 2 }), false);
  assert.equal(isTissue1Value1Agreement({ ...value, tissueRank: 2, activeTissueRank: 1 }), true);
  assert.equal(isTissue1Value1Agreement({ ...value, activeTissueRank: null }), false);
  assert.deepEqual(value, before);
});

test("retired ledgers reject post-epoch additions but allow old pending results to settle", async () => {
  assert.equal(retiredTissueCaptureAllowed(new Date(now.getTime() - 2).toISOString()), true); assert.equal(retiredTissueCaptureAllowed(now.toISOString()), false);
  const turf = await loadTissueForward(TISSUE_V3_CONFIG.forwardPath, TISSUE_V3_CONFIG);
  assert.equal(upsertTissueRaces({ ...turf, races: [] }, [{ ...turf.races[0], recordedAt: now.toISOString() }]).races.length, 0);
  const jump = await loadJumpTissueForward(), pending = structuredClone(jump.races[0]);
  pending.settledAt = null; pending.runners.forEach(r => r.outcome = null);
  assert.equal(captureJumpTissueRaces({ ...jump, races: [] }, [{ ...pending, recordedAt: now.toISOString(), scheduledOffAt: off.toISOString() }]).races.length, 0);
  const race = { ...inputs().meetings[0].races[2], raceId: pending.raceId, raceDateTime: new Date(pending.scheduledOffAt), actualRunnerCount: pending.runners.length,
    runners: pending.runners.map((r, i) => ({ ...inputs().meetings[0].races[2].runners[0], runnerId: r.runnerId, horseId: r.horseId, resultStatus: "finished", finishingPosition: i + 1 })) };
  assert.ok(settleJumpTissueRace(pending, race, after).settledAt);
  assert.equal(pending.settledAt, null);
  const recency = await loadHurdleRecency();
  assert.equal(appendHurdleRecency({ ...recency, observations: [] }, [{ ...recency.observations[0], firstCapturedAt: now.toISOString() }]).observations.length, 0);
  assert.deepEqual(buildHurdleRecencyObservations({ ...inputs(), historyByHorse: new Map() }), []);
  const directory = await mkdtemp(join(tmpdir(), "retired-speed-"));
  try { await freezeChaseSpeedState({ cohort: "primary", raceId: "CHASE", capturedAt: now.toISOString(), race: inputs().meetings[0].races[3], featureNames: [], runners: [] }, directory, now); assert.deepEqual(await readdir(directory), []); }
  finally { await rm(directory, { recursive: true, force: true }); }
});

test("atomic storage preserves capture fields, original versions and settled outcomes without reranking history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clean-tissue-")), path = join(directory, "forward.json"), books = capture();
  try {
    await mutateTissueGeneration(data => appendTissueGeneration(data, books, now), path);
    const bytes = await readFile(path, "utf8");
    await assert.rejects(mutateTissueGeneration(data => { data.races[0].runners[0].rank = 99; return data; }, path), /Cannot rewrite/);
    assert.equal(await readFile(path, "utf8"), bytes);
    assert.equal((await loadTissueGeneration(path)).races[0].modelVersion, "TURF_TISSUE_V4");
    for (const config of VALUE_COHORTS) {
      const saved = await readFile(config.path, "utf8"), source = await loadValueForward(config), before = structuredClone(source);
      const sample = source.races[0];
      predictTissueGeneration(generationModels[config.family], { family: config.family, raceId: sample.raceId, capturedAt: sample.capturedAt, featureNames: sample.featureNames, runners: sample.runners });
      assert.deepEqual(source, before); assert.equal(await readFile(config.path, "utf8"), saved);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("morning/live/after use one clean Tissue monitor and keep independent Value workflows", async () => {
  for (const mode of ["morning", "late", "live", "after"] as const) {
    const steps = workflowSteps(mode, date, now);
    assert.ok(steps.some(s => s.script.startsWith("tissue-generation:")));
    assert.ok(steps.some(s => s.script.startsWith("tissue-value:")));
    for (const script of ["rank-one:sync", "hurdle-recency:sync", "aw-pair:sync", "chase-pair:sync", "tissue:sync", "jump-tissue:sync", "aw-tissue:sync", "sync:aw-shadow"]) assert.ok(!steps.some(s => s.script === script), script);
    if (mode === "live" || mode === "after") assert.ok(steps.some(s => s.script === "research:settle"));
  }
  let data = { ...emptyTissueGeneration(), races: capture() };
  const completedWorkflow = await runWorkflow({ mode: "live", date, now }, async step => {
    if (step.script === "research:settle") data = settleTissueGeneration(data, new Map(data.races.map(r => [r.raceId, resultFor(r)])), after);
    return 0;
  });
  function resultFor(r: GenerationRace) { return result(r); }
  assert.equal(completedWorkflow.exitCode, 0); assert.ok(data.races.every(r => r.runners.every(x => x.outcome?.status === "settled")));
});

test("forced refresh appends later changed pre-off books, keeps history immutable and selects newest whole book", async () => {
  const { attachTissueGeneration } = await import("./tissue-generation-forward");
  const { latestPreOffCaptures } = await import("./frozen-capture-selection");
  const initial = capture(), laterAt = new Date(now.getTime() + 60000);
  const later = initial.map(book => ({ ...structuredClone(book), capturedAt: laterAt.toISOString(),
    runners: book.runners.map(row => ({ ...structuredClone(row), capturedPrice: row.capturedPrice! + 1,
      marketProbability: normalizeCompleteMarket(book.runners.map(r => r.capturedPrice! + 1))!.probabilities[book.runners.indexOf(row)],
      quotes: row.quotes.map(q => ({ ...q, decimalOdds: q.decimalOdds + 1 })) })) }));
  const original = { ...emptyTissueGeneration(), races: initial }, frozen = JSON.stringify(original);
  assert.equal(appendTissueGeneration(original, later, laterAt).races.length, 4, "automated sync stays idempotent");
  const refreshed = appendTissueGeneration(original, later, laterAt, true);
  assert.equal(refreshed.races.length, 8);
  assert.equal(JSON.stringify(original), frozen);
  assert.equal(JSON.stringify(refreshed.races.slice(0, 4)), JSON.stringify(initial));
  assert.equal(appendTissueGeneration(refreshed, later, laterAt, true).races.length, 8);
  const unchanged = later.map(r => ({ ...r, capturedAt: new Date(laterAt.getTime() + 1).toISOString(), featureCutoffAt: laterAt.toISOString() }));
  assert.equal(appendTissueGeneration(refreshed, unchanged, new Date(laterAt.getTime() + 1), true).races.length, 8);
  assert.equal(appendTissueGeneration(original, later, after, true).races.length, 4);
  const selected = attachTissueGeneration(inputs().meetings, { ...refreshed, races: [...later, ...initial] });
  for (const race of selected[0].races) {
    assert.equal(race.runners[0].activeTissue!.capturedAt, laterAt.toISOString());
    assert.equal(race.runners[0].activeTissue!.modelVersion, GENERATION_MODEL_VERSIONS[race.raceId as keyof typeof GENERATION_MODEL_VERSIONS]);
  }
  assert.equal(latestPreOffCaptures([...initial, { ...later[0], capturedAt: off.toISOString() }])[0].capturedAt, now.toISOString());
  const directory = await mkdtemp(join(tmpdir(), "refresh-tissue-")), path = join(directory, "forward.json");
  try {
    await mutateTissueGeneration(data => appendTissueGeneration(data, initial, now), path);
    await mutateTissueGeneration(data => appendTissueGeneration(data, later, laterAt, true), path);
    assert.deepEqual((await loadTissueGeneration(path)).races, refreshed.races, "history reader retains every capture");
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("capture persists full-field normalization and rejects partial or inconsistent probabilities", () => {
  for (const book of capture()) {
    const market = normalizeCompleteMarket(book.runners.map(r => r.capturedPrice))!;
    assert.equal(book.completeMarket, true);
    assert.deepEqual(book.runners.map(r => r.marketProbability), market.probabilities);
    assert.ok(Math.abs(book.runners.reduce((sum, r) => sum + r.marketProbability!, 0) - 1) < 1e-12);
    assert.equal(validGenerationCapture(book), true);
    const corrupt = structuredClone(book); corrupt.runners[0].marketProbability = .99;
    assert.equal(validGenerationCapture(corrupt), false);
    corrupt.runners[0].marketProbability = NaN; assert.equal(validGenerationCapture(corrupt), false);
  }
  for (const price of [null, undefined, NaN, Infinity, 1, 0, -2]) assert.equal(normalizeCompleteMarket([3, price]), null);
  assert.equal(normalizeCompleteMarket([3]), null);
  const input = inputs(); input.meetings[0].races[0].runners[0].bookmakerQuotes = [];
  const book = buildTissueGenerationRaces(input)[0];
  assert.equal(book.completeMarket, false);
  assert.ok(book.runners.every(r => r.marketProbability === null));
  const corrupt = structuredClone(book); corrupt.runners[0].marketProbability = .5;
  assert.equal(validGenerationCapture(corrupt), false);
});

test("legacy frozen complete books project same-capture markets without mutation or live-price inference", () => {
  const books = capture();
  books.forEach(book => book.runners.forEach(row => { delete row.marketProbability; }));
  const data = { ...emptyTissueGeneration(), races: books }, frozen = structuredClone(data);
  const meetings = inputs().meetings;
  meetings[0].races.forEach(r => r.runners.forEach(row => { row.bookmakerQuotes = []; row.oddsDecimal = "1.01"; }));
  const projected = attachTissueGeneration(meetings, data);
  for (const race of projected[0].races) {
    const book = books.find(b => b.raceId === race.raceId)!;
    const market = normalizeCompleteMarket(book.runners.map(r => r.capturedPrice))!;
    for (const runner of race.runners) {
      const i = book.runners.findIndex(r => r.runnerId === runner.runnerId), active = runner.activeTissue!;
      assert.equal(active.marketProbability, market.probabilities[i]);
      assert.equal(active.capturedPrice, book.runners[i].capturedPrice);
      assert.equal(active.probability, book.runners[i].probability); assert.equal(active.rank, book.runners[i].rank);
      assert.equal(active.completeMarket, true); assert.equal(active.bookIdentity, `${book.raceId}|${book.capturedAt}`);
      const html = renderToStaticMarkup(<FrozenRacecardRanks runner={{ activeTissue: active, tissueGenerationActive: true }} />);
      assert.ok(html.includes("data-tissue-market-state"));
      assert.ok(html.includes('data-rank-kind="valueRank"'));
    }
  }
  assert.deepEqual(data, frozen);
  const input = inputs(); input.meetings[0].races[0].runners[0].bookmakerQuotes = [];
  const incomplete = buildTissueGenerationRaces(input)[0];
  const active = attachTissueGeneration(input.meetings, { ...emptyTissueGeneration(), races: [incomplete] })[0].races[0].runners[0].activeTissue!;
  assert.equal(active.completeMarket, false); assert.equal(active.marketProbability, null);
  assert.ok(!renderToStaticMarkup(<FrozenRacecardRanks runner={{ activeTissue: active, tissueGenerationActive: true }} />).includes("data-tissue-market-state"));
});
