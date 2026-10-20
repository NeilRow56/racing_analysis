import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAllFamilyValueRaces } from "./tissue-value-capture";
import { VALUE_COHORTS, TURF_VALUE_CONFIG, type ValueCohortConfig } from "./tissue-value-config";
import { appendValueForward, buildValueRace, emptyValueForward, loadValueForward, mutateValueForward, settleValueForward, type TissueValueRace, type ValueModelBook } from "./tissue-value-forward";
import { loadFrozenTissueModel, TISSUE_V3_CONFIG } from "./tissue-forward";
import { buildAwV2Race, loadAwV2Model } from "./aw-tissue-v2";
import { buildAwSurfaceFeatures } from "./aw-tissue-v2-features";
import { loadJumpTissueModel, predictJumpTissue } from "./jump-tissue-model";
import { calculateHorseMetricsAsOf } from "./horse-metrics";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";
import { attachFrozenValueToMeetings, filterValueRaces, frozenValueIndex } from "./tissue-value-view";
import { summarizeValueBands, summarizeValueRunners, type TissueValueFamily } from "./tissue-value-metrics";
import { TissueValueMonitoring } from "../../app/racing/research/forward-value/tissue-value-monitoring";
import { FrozenValueRankCell } from "../../app/racing/today/tissue-cells";
import { BACKUP_TRACKERS } from "../../../scripts/backup-tracker-inventory";
import { buildRankOneObservations, type RankOneModels } from "./rank-one-forward";
import { loadAwTissueModel } from "./aw-tissue-model";

const now = new Date("2026-10-21T08:00:00.000Z"), date = "2026-10-21", off = new Date("2026-10-21T14:00:00.000Z"), after = new Date("2026-10-21T18:00:00.000Z");
const models = { turf: await loadFrozenTissueModel(TISSUE_V3_CONFIG.modelPath, TISSUE_V3_CONFIG.modelVersion), aw: await loadAwV2Model(), jump: await loadJumpTissueModel() };
function runner(id: string, price: number): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: id, horseName: id, saddleclothNumber: 1, horseAge: 4, horseSex: null, weight: null, weightCarriedLbs: 140,
    draw: 1, jockeyName: null, trainerId: null, trainerName: null, officialRating: 80, odds: "1/100", oddsDecimal: "1.01", forecastOdds: "1/100", forecastDecimalOdds: 1.01,
    finishingPosition: null, resultStatus: null, metrics: calculateHorseMetricsAsOf({ runs: [], beforeDateTime: now, targetWeightCarriedLbs: 140 }),
    bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: null, decimalOdds: price }] };
}
function race(family: TissueValueFamily): TodayRace {
  return { raceId: family, sourceId: family, scheduledTime: "14:00", raceDateTime: off, turfTissueHistoryAsOf: now.toISOString(), courseCountry: "GB",
    raceName: family === "HURDLE" ? "Handicap Hurdle" : family === "CHASE" ? "Handicap Chase" : "Handicap Stakes", raceClass: "4",
    raceType: family === "HURDLE" ? "hurdle" : family === "CHASE" ? "chase" : "flat", raceTypeCode: null, distance: "2m", distanceYards: 3520,
    going: family === "AW" ? "Standard" : "Good", surface: family === "AW" ? "ALLWEATHER" : family === "TURF" ? "Turf" : null,
    declaredRunnerCount: 2, actualRunnerCount: null, winningTime: null, runners: [runner(`${family}-a`, 2), runner(`${family}-b`, 4)] };
}
function inputs() {
  const meetings: TodayMeeting[] = [{ courseId: "course", courseSourceId: "course", courseName: "Newcastle", country: "GB", order: 1, races: VALUE_COHORTS.map(c => race(c.family)) }];
  const aw = meetings[0].races.find(r => r.raceId === "AW")!;
  const awContext = { historyCutoffAt: now.toISOString(), comments: new Map(), surfaceByRunner: new Map(aw.runners.map(r => [r.runnerId,
    buildAwSurfaceFeatures({ targetRaceId: aw.raceId, targetAt: off, historyCutoff: now, course: "Newcastle", surface: "ALLWEATHER", historyLoaded: true, priors: [] })])) };
  return { meetings, raceDate: date, capturedAt: now, historyCutoffAt: now.toISOString(), models, commentsByHorse: new Map(), awContext };
}
function captured() { return buildAllFamilyValueRaces(inputs()); }
function dataFor(book: TissueValueRace) {
  const config = VALUE_COHORTS.find(c => c.family === book.family)!;
  return { config, data: appendValueForward(emptyValueForward(config), [book], config) };
}
function modelBook(book: TissueValueRace): ValueModelBook { return { modelVersion: book.modelVersion, modelChecksum: book.modelChecksum, scorerVersion: book.scorerVersion,
  featureSchemaVersion: book.featureSchemaVersion, featureNames: book.featureNames, featureCutoffAt: book.featureCutoffAt, runners: book.runners.map(r => ({ runnerId: r.runnerId, probability: r.probability, tissueRank: r.tissueRank, modelInputs: [...r.modelInputs] })) }; }
function rebuilt(book: ValueModelBook, config: ValueCohortConfig, at = now) { return buildValueRace({ config, book, race: race(config.family), course: "Newcastle", raceDate: date, capturedAt: at }); }
const close = (a: number, b: number) => assert.ok(Math.abs(a-b) < 1e-12, `${a} != ${b}`);

test("all four current model families produce normalized all-runner books and separate identities", () => {
  const books = captured(); assert.equal(books.length, 4);
  assert.deepEqual(new Set(books.map(b => b.family)), new Set(["TURF", "AW", "HURDLE", "CHASE"]));
  for (const b of books) {
    const config = VALUE_COHORTS.find(c => c.family === b.family)!;
    assert.equal(b.version, config.version); assert.equal(b.modelVersion, config.modelVersion); assert.equal(b.featureSchemaVersion, config.featureSchemaVersion);
    assert.equal(b.runners.length, 2); close(b.runners.reduce((s,r) => s+r.probability, 0), 1); close(b.runners.reduce((s,r) => s+r.marketProbability, 0), 1);
    assert.ok(b.runners.every(r => r.modelInputs.length === config.featureNames.length));
  }
});
test("AW and Jump probabilities and native Tissue ranks exactly match their existing live scorers", () => {
  const input = inputs(), books = buildAllFamilyValueRaces(input), races = input.meetings[0].races;
  const aw = buildAwV2Race(races[1], "Newcastle", date, models.aw, input.awContext, now)!;
  assert.deepEqual(books.find(b => b.family === "AW")!.runners.map(r => [r.probability,r.tissueRank,r.modelInputs]), aw.runners.map(r => [r.probability,r.rank,r.modelInputs]));
  for (const family of ["HURDLE","CHASE"] as const) {
    const jump = predictJumpTissue(races.find(r => r.raceId === family)!, input.commentsByHorse, models.jump);
    assert.deepEqual(books.find(b => b.family === family)!.runners.map(r => [r.probability,r.tissueRank,r.modelInputs]), jump.runners.map(r => [r.probability,r.rank,r.modelInputs]));
    assert.deepEqual(jump.runners.map(r => r.rank), [1,2]);
  }
});
test("one shared value calculation and deterministic value ranks apply to all families", () => {
  for (const b of captured()) {
    close(b.marketBookSum, .75); assert.deepEqual(b.runners.map(r => r.valueRank), [2,1]);
    for (const r of b.runners) {
      close(r.marketProbability,(1/r.marketPrice)/.75); close(r.fairOdds,1/r.probability); close(r.probabilityEdge,r.probability-r.marketProbability);
      close(r.modelMarketRatio,r.probability/r.marketProbability); close(r.expectedReturn,r.probability*r.marketPrice-1);
    }
  }
});
test("probability gate refuses missing, partial, nonfinite, score-only or unnormalized probabilities", () => {
  for (const config of VALUE_COHORTS) {
    const saved = captured().find(b => b.family === config.family)!;
    for (const p of [null, NaN, Infinity, 0]) { const b=modelBook(saved); b.runners[0].probability=p; assert.equal(rebuilt(b,config),null); }
    const b=modelBook(saved); b.runners[0].probability=.2; assert.equal(rebuilt(b,config),null); // no renormalization or odds-derived repair
    const missing=modelBook(saved); missing.runners.pop(); assert.equal(rebuilt(missing,config),null);
    const noVector=modelBook(saved); noVector.runners[0].modelInputs=null; assert.equal(rebuilt(noVector,config),null);
    assert.equal(rebuilt(modelBook(saved),{...config,probabilityAvailable:false,unavailableReason:"Only scores/ranks available"}),null);
  }
});
test("a missing Jump history vector blocks the whole race rather than inventing a probability", () => {
  for (const family of ["HURDLE","CHASE"] as const) {
    const input=inputs(); input.meetings[0].races.find(r=>r.raceId===family)!.runners[0].metrics=null;
    assert.ok(!buildAllFamilyValueRaces(input).some(b=>b.family===family));
  }
});
test("wrong model generations, schemas, family and tracker versions cannot enter a cohort", () => {
  for (const saved of captured()) {
    const {config,data}=dataFor(saved);
    for (const field of ["modelVersion","version","featureSchemaVersion","family"] as const) {
      const wrong=structuredClone(saved); Object.assign(wrong,{[field]:"legacy"}); assert.equal(appendValueForward(emptyValueForward(config),[wrong],config).races.length,0);
    }
    assert.throws(()=>appendValueForward({...data,version:"legacy"},[],config),/cohort mismatch/);
    const wrong=modelBook(saved); wrong.modelVersion=saved.family==="AW"?"AW_TISSUE_V1":"tissue_model_v2"; assert.equal(rebuilt(wrong,config),null);
  }
});
test("new family epochs are independent while the Turf cohort and epoch are preserved", () => {
  assert.equal(TURF_VALUE_CONFIG.epoch,"2026-10-20T04:39:30.000Z");
  for (const config of VALUE_COHORTS.slice(1)) assert.ok(config.epoch>TURF_VALUE_CONFIG.epoch);
  for (const b of captured()) {
    const config=VALUE_COHORTS.find(c=>c.family===b.family)!;
    assert.equal(rebuilt(modelBook(b),config,new Date(Date.parse(config.epoch)-1)),null);
    assert.equal(rebuilt(modelBook(b),config,off),null);
    const source=inputs(); source.raceDate="2026-10-19"; assert.deepEqual(buildAllFamilyValueRaces(source),[]);
  }
});
test("every family rejects SP/forecast fallback and incomplete median markets", () => {
  for (const family of ["TURF","AW","HURDLE","CHASE"] as const) {
    const input=inputs(); input.meetings[0].races.find(r=>r.raceId===family)!.runners[0].bookmakerQuotes=[];
    const books=buildAllFamilyValueRaces(input); assert.equal(books.length,3); assert.ok(!books.some(b=>b.family===family));
  }
});
test("family filters preserve model cohorts and fixed bands for pooled and individual views", () => {
  const books=captured(); assert.equal(filterValueRaces(books,"ALL").length,4);
  for (const family of ["TURF","AW","HURDLE","CHASE"] as const) {
    const filtered=filterValueRaces(books,family); assert.equal(filtered.length,1); assert.equal(filtered[0].family,family);
    const summary=summarizeValueBands(filtered[0].runners); assert.equal(summary.ratio.length,6); assert.equal(summary.marketRank.length,6);
  }
  const summary=summarizeValueRunners(books.flatMap(b=>b.runners)); assert.equal(summary.tracked,8); assert.equal(summary.runners,0);
});
test("captured prices, vectors, ranks and probabilities stay immutable in every family", async () => {
  const dir=await mkdtemp(join(tmpdir(),"all-value-"));
  try {
    for (const saved of captured()) {
      const {config}=dataFor(saved),path=join(dir,config.family+".json");
      await mutateValueForward(config,d=>appendValueForward(d,[saved],config),path);
      const bytes=await readFile(path,"utf8");
      await mutateValueForward(config,d=>appendValueForward(d,[saved],config),path); assert.equal(await readFile(path,"utf8"),bytes);
      await assert.rejects(mutateValueForward(config,d=>{d.races[0].runners[0].marketPrice=999;return d;},path),/Cannot rewrite/);
      assert.equal(await readFile(path,"utf8"),bytes); assert.equal((await loadValueForward(config,path)).races[0].modelVersion,config.modelVersion);
    }
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test("canonical settlement and captured-price accounting are shared across families", () => {
  for (const saved of captured()) {
    const {data}=dataFor(saved),r=race(saved.family); r.actualRunnerCount=2; r.runners=r.runners.map((row,i)=>({...row,resultStatus:"finished",finishingPosition:i+1,oddsDecimal:"999"}));
    const settled=settleValueForward(data,new Map([[r.raceId,r]]),after);
    assert.deepEqual(settled.races[0].runners.map(row=>row.outcome!.profitLoss),[1,-1]);
    assert.deepEqual(settled.races[0].runners.map(row=>row.probability),saved.runners.map(row=>row.probability));
    assert.equal(settleValueForward(settled,new Map([[r.raceId,r]]),after),settled);
  }
});
test("Today's Racing and Research consume identical frozen authoritative ranks with no live fallback", () => {
  const books=captured(),datasets=books.map(b=>dataFor(b).data),index=frozenValueIndex(datasets);
  const attached=attachFrozenValueToMeetings(inputs().meetings,datasets);
  for (const r of attached[0].races) for (const row of r.runners) {
    const saved=books.find(b=>b.raceId===r.raceId)!.runners.find(x=>x.runnerId===row.runnerId)!;
    assert.equal(row.tissueValue!.valueRank,saved.valueRank); assert.equal(row.tissueValue!.tissueRank,saved.tissueRank); assert.equal(row.tissueValue!.probability,saved.probability);
    assert.deepEqual(row.tissueValue,index.get(`${r.raceId}|${row.runnerId}`));
    const html=renderToStaticMarkup(<FrozenValueRankCell runner={row} kind="valueRank"/>); assert.ok(html.includes(`>${saved.valueRank}</span>`));
  }
  const missing=attachFrozenValueToMeetings(inputs().meetings,[])[0].races[0].runners[0];
  assert.equal(missing.tissueValue,undefined); assert.ok(renderToStaticMarkup(<FrozenValueRankCell runner={missing} kind="valueRank"/>).includes("No frozen prospective"));
});
test("Research displays all family summaries, pooled labels and explicit blocked probability state", () => {
  const cohorts=captured().map(dataFor),html=renderToStaticMarkup(<TissueValueMonitoring cohorts={cohorts} date={date}/>);
  for (const label of ["ALL","TURF","AW","HURDLE","CHASE","Pooled descriptive summary","tissue_model_v3","AW_TISSUE_V2","JUMP_TISSUE_V1","Sort runners by","Market rank","Large model/market disagreement"]) assert.ok(html.includes(label),label);
  const blocked=cohorts.map(c=>c.config.family==="HURDLE"?{...c,config:{...c.config,probabilityAvailable:false,unavailableReason:"Only scores/ranks available"}}:c);
  const unavailable=renderToStaticMarkup(<TissueValueMonitoring cohorts={blocked} date={date}/>); assert.ok(unavailable.includes("VALUE MONITORING NOT AVAILABLE")); assert.ok(unavailable.includes("Only scores/ranks available"));
});
test("weekly inventory includes every active value tracker and existing current model ledgers", () => {
  const names=new Set(BACKUP_TRACKERS.map(([name])=>name));
  for (const c of VALUE_COHORTS) assert.ok(names.has(c.path.split("/").at(-1)! as typeof BACKUP_TRACKERS[number][0]),c.path);
  assert.ok(names.has("tissue-forward-v3.json")); assert.ok(names.has("aw-tissue-forward-v2.json"));
});
test("all-family value capture does not alter any Rank 1 capture", async () => {
  const input=inputs(),rankModels:RankOneModels={turf:models.turf,jump:models.jump,aw:await loadAwTissueModel(),awV2:models.aw,awV2Context:input.awContext,comments:input.commentsByHorse,awStarts:new Map()};
  const args={meetings:input.meetings,raceDate:date,capturedAt:now,models:rankModels}; const before=buildRankOneObservations(args);
  buildAllFamilyValueRaces(input); assert.deepEqual(buildRankOneObservations(args),before); assert.equal(before.length,4);
});
