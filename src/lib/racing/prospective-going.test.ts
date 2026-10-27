import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { canonicalGoing, captureProspectiveGoing, EXACT_GOING_CAPTURE_EPOCH } from "./prospective-going";
import { buildTissueForwardRace, enrichTissueForwardRace, loadFrozenTissueModel, loadTissueForward, TISSUE_V3_CONFIG, upsertTissueRaces, type TissueForwardData } from "./tissue-forward";
import { buildJumpTissueRace, captureJumpTissueRaces, emptyJumpTissueForward, enrichJumpTissuePrices, loadJumpTissueForward, settleJumpTissueRace } from "./jump-tissue-forward";
import { buildAllFamilyValueRaces } from "./tissue-value-capture";
import { appendValueForward, emptyValueForward, loadValueForward, mutateValueForward, settleValueForward } from "./tissue-value-forward";
import { VALUE_COHORTS } from "./tissue-value-config";
import { buildAwSurfaceFeatures } from "./aw-tissue-v2-features";
import { emptyAwV2Forward, loadAwV2Model } from "./aw-tissue-v2";
import { loadJumpTissueModel } from "./jump-tissue-model";
import { loadAwTissueModel } from "./aw-tissue-model";
import { appendRankOne, buildRankOneObservations, emptyRankOne, loadRankOne, settleRankOne } from "./rank-one-forward";
import { calculateHorseMetricsAsOf } from "./horse-metrics";
import { buildProspectiveTissueSources } from "./tissue-prospective-sources";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";
import type { TissueValueFamily } from "./tissue-value-metrics";

const at = new Date(EXACT_GOING_CAPTURE_EPOCH), before = new Date(at.getTime() - 1);
const date = "2026-10-25", off = new Date(`${date}T23:00:00.000Z`), after = new Date(`${date}T23:30:00.000Z`);
const models = { turf: await loadFrozenTissueModel(TISSUE_V3_CONFIG.modelPath, TISSUE_V3_CONFIG.modelVersion), aw: await loadAwV2Model(), jump: await loadJumpTissueModel() };
const legacyAw = await loadAwTissueModel();
function runner(id: string, price: number): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: id, horseName: id, saddleclothNumber: 1, horseAge: 4, horseSex: null, weight: null, weightCarriedLbs: 140,
    draw: 1, jockeyName: null, trainerId: null, trainerName: null, officialRating: 80, odds: "3/1", oddsDecimal: "4", forecastOdds: null, forecastDecimalOdds: null,
    finishingPosition: null, resultStatus: null, metrics: calculateHorseMetricsAsOf({ runs: [], beforeDateTime: before, targetWeightCarriedLbs: 140 }),
    bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: null, decimalOdds: price }] };
}
function race(family: TissueValueFamily): TodayRace {
  return { raceId: family, sourceId: family, scheduledTime: "23:00", raceDateTime: off, turfTissueHistoryAsOf: before.toISOString(), courseCountry: "GB",
    raceName: family === "HURDLE" ? "Handicap Hurdle" : family === "CHASE" ? "Handicap Chase" : "Handicap Stakes", raceClass: "4",
    raceType: family === "HURDLE" ? "hurdle" : family === "CHASE" ? "chase" : "flat", raceTypeCode: null, distance: "2m", distanceYards: 3520,
    going: family === "AW" ? "Standard" : family === "TURF" ? "Good to Soft, Soft in places" : family === "HURDLE" ? "Soft, heavy in places" : "Heavy",
    surface: family === "AW" ? "ALLWEATHER" : family === "TURF" ? "Turf" : null,
    declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null, runners: [runner(`${family}-a`, 2), runner(`${family}-b`, 4)] };
}
function input() {
  const meetings: TodayMeeting[] = [{ courseId: "course", courseSourceId: "course", courseName: "Newcastle", country: "GB", order: 1, races: VALUE_COHORTS.map(c => race(c.family)) }];
  const aw = meetings[0].races.find(r => r.raceId === "AW")!;
  const awContext = { historyCutoffAt: before.toISOString(), comments: new Map(), surfaceByRunner: new Map(aw.runners.map(r => [r.runnerId,
    buildAwSurfaceFeatures({ targetRaceId: aw.raceId, targetAt: off, historyCutoff: before, course: "Newcastle", surface: "ALLWEATHER", historyLoaded: true, priors: [] })])) };
  return { meetings, raceDate: date, capturedAt: at, historyCutoffAt: before.toISOString(), models, commentsByHorse: new Map(), awContext };
}
function primary(i = input(), time = at) {
  const turf = buildTissueForwardRace({ raceDate: date, course: "Newcastle", race: i.meetings[0].races[0], model: models.turf, commentsByHorse: new Map(), recordedAt: time, config: TISSUE_V3_CONFIG })!;
  const jump = i.meetings[0].races.filter(r => ["HURDLE", "CHASE"].includes(r.raceId)).map(race => buildJumpTissueRace({ raceDate: date, course: "Newcastle", race, model: models.jump, commentsByHorse: new Map(), recordedAt: time })!);
  assert.ok(turf); assert.ok(jump.every(Boolean));
  return { turf, jump };
}
function rankOne(i = input(), time = at) {
  return buildRankOneObservations({ meetings: i.meetings, raceDate: date, capturedAt: time, models: {
    turf: models.turf, jump: models.jump, aw: legacyAw, awV2: models.aw, awV2Context: i.awContext, comments: new Map(), awStarts: new Map(),
  } });
}
function withoutMetadata(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), (key, v) => ["goingRaw", "goingCanonical", "capturedAt", "recordedAt", "firstCapturedAt", "captureDateTime"].includes(key) ? undefined : v);
}
function results(i = input()) {
  return new Map(i.meetings[0].races.map(r => [r.raceId, { ...r, going: "Firm", winningTime: "3m", actualRunnerCount: 2,
    runners: r.runners.map((runner, n) => ({ ...runner, finishingPosition: n + 1, resultStatus: "finished" })) }]));
}

test("exact lexical canonicalisation preserves mixed/Irish terms and never silently maps missing to Good", () => {
  for (const [raw, expected] of [["Firm", "FIRM"], [" Good   to Firm ", "GOOD_TO_FIRM"], ["Good", "GOOD"], ["Good-to-Soft", "GOOD_TO_SOFT"], ["Soft", "SOFT"], ["Heavy", "HEAVY"], ["Yielding", "YIELDING"], ["Yielding to Soft", "YIELDING_TO_SOFT"], ["Good to Yielding", "GOOD_TO_YIELDING"], ["Soft to Heavy", "SOFT_TO_HEAVY"], ["Heavy, Soft in places", "HEAVY_SOFT_IN_PLACES"], ["Good to Soft, Soft in places", "GOOD_TO_SOFT_SOFT_IN_PLACES"], ["Unknown description", "UNKNOWN_DESCRIPTION"], ["  ", null], [null, null]] as const) {
    assert.equal(canonicalGoing(raw), expected);
    assert.deepEqual(captureProspectiveGoing(raw, at), { goingRaw: raw, goingCanonical: expected });
  }
  assert.deepEqual(captureProspectiveGoing("Soft", before), {});
  assert.deepEqual(captureProspectiveGoing("Soft", new Date("invalid")), {});
});

test("Turf/Hurdle/Chase books, Value captures and separate Rank 1 ledger freeze their own raw/canonical going; AW is null", () => {
  const i = input(), p = primary(i), values = buildAllFamilyValueRaces(i), ranks = rankOne(i);
  assert.equal(values.length, 4); assert.equal(ranks.length, 4);
  for (const live of i.meetings[0].races) {
    const raw = live.raceId === "AW" ? null : live.going;
    for (const record of [...values, ...ranks, p.turf, ...p.jump].filter(r => r.raceId === live.raceId)) {
      assert.equal(record.goingRaw, raw); assert.equal(record.goingCanonical, canonicalGoing(raw));
    }
  }
  for (const live of i.meetings[0].races) live.going = null;
  const missing = primary(i);
  for (const record of [missing.turf, ...missing.jump, ...buildAllFamilyValueRaces(i), ...rankOne(i)]) {
    assert.equal(record.goingRaw, null); assert.equal(record.goingCanonical, null);
  }
});

test("metadata-only epoch leaves complete model vectors, probabilities, ranks, Value and market calculations identical", () => {
  const i = input();
  assert.deepEqual(withoutMetadata(primary(i)), withoutMetadata(primary(i, before)));
  assert.deepEqual(withoutMetadata(buildAllFamilyValueRaces(i)), withoutMetadata(buildAllFamilyValueRaces({ ...i, capturedAt: before })));
  assert.deepEqual(withoutMetadata(rankOne(i)), withoutMetadata(rankOne(i, before)));
});

test("refresh/duplicate capture and settlement preserve going and identical financial outcomes", () => {
  const i = input(), p = primary(i), live = results(i), values = buildAllFamilyValueRaces(i), ranks = rankOne(i);
  const turfData: TissueForwardData = { version: TISSUE_V3_CONFIG.forwardVersion, tissueModelVersion: TISSUE_V3_CONFIG.modelVersion, forwardStart: TISSUE_V3_CONFIG.forwardStart, races: [p.turf] };
  const jumpData = { ...emptyJumpTissueForward(), races: p.jump };
  const rankData = { ...emptyRankOne(), observations: ranks };
  for (const race of i.meetings[0].races) race.going = "Firm";
  assert.deepEqual(upsertTissueRaces(turfData, [primary(i).turf]), turfData);
  assert.deepEqual(captureJumpTissueRaces(jumpData, primary(i).jump), jumpData);
  assert.equal(appendRankOne(rankData, rankOne(i)), rankData);
  const settledTurf = enrichTissueForwardRace(p.turf, live.get("TURF")!, after);
  assert.equal(settledTurf.goingRaw, p.turf.goingRaw); assert.ok(settledTurf.settledAt);
  assert.deepEqual(withoutMetadata(settledTurf), withoutMetadata(enrichTissueForwardRace(primary(input(), before).turf, live.get("TURF")!, after)));
  for (const r of p.jump) {
    const refreshed = enrichJumpTissuePrices(r, { ...live.get(r.raceId)!, winningTime: null, runners: race(r.raceId as TissueValueFamily).runners }, at);
    assert.equal(refreshed.goingRaw, r.goingRaw);
    const settled = settleJumpTissueRace(r, live.get(r.raceId)!, after);
    assert.ok(settled.settledAt); assert.equal(settled.goingRaw, r.goingRaw); assert.equal(settled.goingCanonical, r.goingCanonical);
    const legacy = primary(input(), before).jump.find(j => j.raceId === r.raceId)!;
    assert.deepEqual(withoutMetadata(settled), withoutMetadata(settleJumpTissueRace(legacy, live.get(r.raceId)!, after)));
  }
  for (const book of values) {
    const config = VALUE_COHORTS.find(c => c.family === book.family)!;
    const data = { ...emptyValueForward(config), races: [book] };
    assert.equal(appendValueForward(data, buildAllFamilyValueRaces(i).filter(r => r.family === book.family), config), data);
    const settled = settleValueForward(data, live, after).races[0];
    assert.ok(settled.runners.every(r => r.outcome)); assert.equal(settled.goingRaw, book.goingRaw); assert.equal(settled.goingCanonical, book.goingCanonical);
    const legacyBook = buildAllFamilyValueRaces({ ...input(), capturedAt: before }).find(b => b.family === book.family)!;
    assert.deepEqual(withoutMetadata(settled), withoutMetadata(settleValueForward({ ...emptyValueForward(config), races: [legacyBook] }, live, after).races[0]));
  }
  const settledRanks = settleRankOne(rankData, live, after);
  assert.ok(settledRanks.observations.every(r => r.outcome));
  assert.deepEqual(settledRanks.observations.map(r => [r.goingRaw, r.goingCanonical]), ranks.map(r => [r.goingRaw, r.goingCanonical]));
  assert.deepEqual(withoutMetadata(settledRanks), withoutMetadata(settleRankOne({ ...emptyRankOne(), observations: rankOne(input(), before) }, live, after)));
});

test("runner projection uses each book's own going and legacy absence remains null without enrichment", () => {
  const i = input(), p = primary(i), values = buildAllFamilyValueRaces(i);
  values[0].goingRaw = "Heavy"; values[0].goingCanonical = "HEAVY";
  const source = { turf: { version: TISSUE_V3_CONFIG.forwardVersion, tissueModelVersion: TISSUE_V3_CONFIG.modelVersion, forwardStart: TISSUE_V3_CONFIG.forwardStart, races: [p.turf] }, aw: emptyAwV2Forward(), jump: { ...emptyJumpTissueForward(), races: p.jump },
    cohorts: values.map(book => ({ config: VALUE_COHORTS.find(c => c.family === book.family)!, data: { ...emptyValueForward(VALUE_COHORTS.find(c => c.family === book.family)!), races: [book] } })) };
  const snapshot = JSON.stringify(source), output = buildProspectiveTissueSources(source);
  assert.equal(output.observations[0].goingCanonical, p.turf.goingCanonical);
  assert.equal(output.priceObservations[0].goingCanonical, "HEAVY");
  assert.equal(JSON.stringify(source), snapshot);
  delete p.turf.goingRaw; delete p.turf.goingCanonical;
  const legacy = buildProspectiveTissueSources(source);
  assert.equal(legacy.observations[0].goingRaw, null); assert.equal(legacy.observations[0].goingCanonical, null);
  assert.ok(!Object.hasOwn(p.turf, "goingRaw"));
});

test("legacy/current JSONs round-trip without inserting old fields; Value guard rejects metadata overwrite", async () => {
  const dir = await mkdtemp(join(tmpdir(), "going-capture-"));
  try {
    const i = input(), p = primary(i, before), book = buildAllFamilyValueRaces({ ...i, capturedAt: before })[0], config = VALUE_COHORTS[0];
    const turfData = { version: TISSUE_V3_CONFIG.forwardVersion, tissueModelVersion: TISSUE_V3_CONFIG.modelVersion, forwardStart: TISSUE_V3_CONFIG.forwardStart, races: [p.turf] };
    const files = [
      { name: "turf", data: turfData, load: (path: string) => loadTissueForward(path, TISSUE_V3_CONFIG) },
      { name: "jump", data: { ...emptyJumpTissueForward(), races: p.jump }, load: (path: string) => loadJumpTissueForward(path as Parameters<typeof loadJumpTissueForward>[0]) },
      { name: "rank", data: { ...emptyRankOne(), observations: rankOne(i, before) }, load: loadRankOne },
    ];
    for (const f of files) {
      const path = join(dir, f.name), bytes = JSON.stringify(f.data); await writeFile(path, bytes);
      assert.deepEqual(await f.load(path), f.data); assert.equal(await readFile(path, "utf8"), bytes);
    }
    const path = join(dir, "value"), data = { ...emptyValueForward(config), races: [book] }, bytes = JSON.stringify(data);
    await writeFile(path, bytes); assert.deepEqual(await loadValueForward(config, path), data);
    await mutateValueForward(config, d => d, path); assert.equal(await readFile(path, "utf8"), bytes);
    await assert.rejects(mutateValueForward(config, d => ({ ...d, races: d.races.map(r => ({ ...r, goingRaw: "Heavy", goingCanonical: "HEAVY" })) }), path), /Cannot rewrite frozen/);
    assert.equal(await readFile(path, "utf8"), bytes);
    const current = buildAllFamilyValueRaces(i)[0];
    await writeFile(path, JSON.stringify({ ...data, races: [current] }));
    assert.deepEqual((await loadValueForward(config, path)).races[0], current);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
