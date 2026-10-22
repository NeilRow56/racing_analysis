import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAwV2Model, buildAwV2Race, emptyAwV2Forward, captureAwV2Races, awV2LiveFeatureInput, AW_TISSUE_V2_SCORER, type AwV2Context } from "./aw-tissue-v2";
import { AW_TISSUE_V2_EPOCH, AW_TISSUE_V2_ACTIVE } from "./aw-tissue-v2-activation";
import { AW_V2_NAMES, buildAwSurfaceFeatures, awV2NumericVector } from "./aw-tissue-v2-features";
import { calculateHorseMetricsAsOf, type HistoricalRunInput } from "./horse-metrics";
import { score, raceSoftmax } from "../../../scripts/diagnose-independent-tissue-feasibility";
import { buildTissueForwardRace, loadFrozenTissueModel, TISSUE_V3_CONFIG } from "./tissue-forward";
import { captureAwTissueRaces, settleAwTissueRace, loadAwTissueForward, mutateAwTissueForward } from "./aw-tissue-forward";
import { appendRankOne, buildRankOneObservations, emptyRankOne, RANK_ONE_CONTRACT_EFFECTIVE_AT, rankOneMetrics, settleRankOne, summarizeRankOne, type RankOneModels } from "./rank-one-forward";
import { loadAwTissueModel } from "./aw-tissue-model";
import { loadJumpTissueModel } from "./jump-tissue-model";
import { getLocalRacingDate, type TodayRace, type TodayRunner } from "./todays-racing";

const model = await loadAwV2Model();
const turf = await loadFrozenTissueModel(TISSUE_V3_CONFIG.modelPath, TISSUE_V3_CONFIG.modelVersion);
const at = new Date(Math.max(Date.parse(AW_TISSUE_V2_EPOCH), Date.parse(model.trainedAt), Date.parse(RANK_ONE_CONTRACT_EFFECTIVE_AT.slice(0, 10) + "T08:00:00Z")) + 86400000);
const date = getLocalRacingDate(at), off = new Date(at.getTime() + 6 * 3600000);
function runner(id: string, price = 4): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: id, horseName: id, saddleclothNumber: 1, horseAge: 4, horseSex: null, weight: null, weightCarriedLbs: 140, draw: 2, jockeyName: null, trainerId: null, trainerName: null, officialRating: 80, odds: null, oddsDecimal: null, finishingPosition: null, resultStatus: null,
    metrics: calculateHorseMetricsAsOf({ runs: [], beforeDateTime: at, targetWeightCarriedLbs: 140 }), bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Book", fractionalOdds: null, decimalOdds: price }] };
}
function race(): TodayRace {
  return { raceId: "aw", sourceId: "aw", scheduledTime: "14:00", raceDateTime: off, raceName: "Handicap", raceType: "flat", raceTypeCode: "FLAT", raceClass: "4", distance: "1m", distanceYards: 1760, going: "Standard", surface: "ALLWEATHER", courseCountry: "GB", declaredRunnerCount: 2, actualRunnerCount: 99, winningTime: null, runners: [runner("b", 2), runner("a", 4)], turfTissueHistoryAsOf: at.toISOString() };
}
function context(): AwV2Context { return { historyCutoffAt: at.toISOString(), comments: new Map(), surfaceByRunner: new Map(["a", "b"].map(id => [id, buildAwSurfaceFeatures({ targetRaceId: "aw", targetAt: off, historyCutoff: at, course: "Newcastle", surface: "ALLWEATHER", historyLoaded: true, priors: [] })])) }; }
function book(card = race(), ctx = context(), now = at) { return buildAwV2Race(card, "Newcastle", date, model, ctx, now); }
function legacyModels(ctx = context()): Promise<RankOneModels> { return Promise.all([loadAwTissueModel(), loadJumpTissueModel()]).then(([aw, jump]) => ({ aw, jump, turf, awV2: model, awV2Context: ctx, comments: new Map(), awStarts: new Map() })); }

test("separately fitted artifact has 95 correct columns, distinct parameters and mapping pin", () => {
  assert.deepEqual(model.model.names, AW_V2_NAMES);
  assert.notDeepEqual(model.model.weights, turf.model.weights);
  assert.equal(model.specification.epochs, 90); assert.equal(model.specification.l2, .02);
  assert.equal(model.specification.calibration, "none");
});
test("same scoring/normalization and competition ties; declaration count ignores results", () => {
  const b = book()!; assert(b);
  const expected = raceSoftmax(b.runners.map(r => score(model.model, r.modelInputs!)));
  assert.deepEqual(b.runners.map(r => r.probability), expected);
  assert.deepEqual(b.runners.map(r => r.rank), [1, 1]); assert.equal(b.top1, "a");
  assert.equal(b.runners[0]!.modelInputs![20], 2); assert.equal(b.runners[0]!.modelInputs![22], 1);
  assert.deepEqual(book({ ...race(), actualRunnerCount: 1 })!.runners.map(r => r.modelInputs), b.runners.map(r => r.modelInputs));
});
test("Turf v3 and AW v2 reject the same capture-integrity violations", () => {
  const changes: Array<(r: TodayRace, c: AwV2Context) => void> = [
    r => { r.winningTime = "1m"; }, r => { r.runners[0]!.finishingPosition = 1; }, r => { r.runners[0]!.resultStatus = "finished"; },
    r => { r.declaredRunnerCount = 3; }, r => { r.declaredRunnerCount = null; }, r => { r.runners[1]!.runnerId = r.runners[0]!.runnerId; },
    r => { r.runners[0]!.officialRating = Infinity; }, r => { r.raceDateTime = new Date(at.getTime() - 1); },
    (r,c) => { c.historyCutoffAt = "invalid"; r.turfTissueHistoryAsOf = "invalid"; },
    (r,c) => { c.historyCutoffAt = new Date(at.getTime() + 1).toISOString(); r.turfTissueHistoryAsOf = c.historyCutoffAt; },
  ];
  for (const change of changes) {
    const card = race(), ctx = context(); change(card,ctx);
    assert.equal(book(card, ctx), null);
    assert.equal(buildTissueForwardRace({ race: { ...card, surface: "Turf", going: "Good" }, course: "Newcastle", raceDate: date, model: turf, commentsByHorse: new Map(), recordedAt: at, config: TISSUE_V3_CONFIG }), null);
  }
  assert.equal(book(race(), context(), new Date(Date.parse(AW_TISSUE_V2_EPOCH) - 1)), null);
  assert.equal(book(race(), context(), new Date(model.trainedAt)), null); // history cutoff later than capture
});
test("unknown target material and incomplete history loading cannot fall back to AW v1", () => {
  assert.equal(buildAwV2Race(race(), "TRP Extras", date, model, context(), at), null);
  assert.equal(book(race(), { ...context(), surfaceByRunner: new Map() }), null);
  assert.equal(buildAwV2Race(race(), "Newcastle", "2025-01-01", model, context(), at), null);
});
test("frozen vectors, evidence, probability, price and cutoff survive later inputs and recapture", () => {
  const ctx = context(), card = race(), record = book(card,ctx)!;
  const before = JSON.stringify(record), data = captureAwTissueRaces(emptyAwV2Forward(), [record]);
  ctx.surfaceByRunner.get("a")!.selectedPriorRunnerIds.push("future");
  card.runners[0]!.officialRating = 999; card.runners[0]!.bookmakerQuotes![0]!.decimalOdds = 99;
  assert.equal(JSON.stringify(record), before);
  assert.equal(record.featureCutoffAt, at.toISOString());
  assert.equal(record.runners[0]!.modelInputs!.length, 95);
  assert.equal(record.firstCaptureMarket![0]!.price, 2);
  assert.equal(record.firstCaptureMarket![0]!.rank, 1);
  assert.equal(captureAwTissueRaces(data, [book(card)!]).races[0], record);
});
test("target and post-capture comments cannot enrich a frozen AW vector", () => {
  const ctx = context();
  ctx.comments.set("a", [{ raceId: "future", raceDate: date, raceDateTime: new Date(at.getTime() + 1), comment: "led stayed on" }, { raceId: "old", raceDate: date, raceDateTime: new Date(at.getTime() - 1), comment: "dwelt" }]);
  const record = book(race(),ctx)!;
  assert.equal(record.runners.find(r=>r.runnerId==="a")!.modelInputs![52],1);
});
test("versioned tracker writes new file only and rejects legacy header", async () => {
  const dir = await mkdtemp(join(tmpdir(),"aw-v2-track-")), path = join(dir,"new.json");
  try {
    await mutateAwTissueForward(d => captureAwTissueRaces(d,[book()!]),path,emptyAwV2Forward());
    const loaded = await loadAwTissueForward(path,emptyAwV2Forward()); assert.equal(loaded.races.length,1);
    await assert.rejects(loadAwTissueForward(path), /Unsupported/);
    assert.equal(captureAwTissueRaces(emptyAwV2Forward(),[{...book()!,recordedPreRace:false}]).races.length,0);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test("unsafe/altered artifact parameters cannot load", async () => {
  const dir=await mkdtemp(join(tmpdir(),"aw-v2-model-")),path=join(dir,"bad.json");
  try { const invalid=structuredClone(model); invalid.model.scales[0]=0; await writeFile(path,JSON.stringify(invalid)); await assert.rejects(loadAwV2Model(path),/Invalid/); }
  finally { await rm(dir,{recursive:true,force:true}); }
});
test("AW v2 Rank 1 shares capture, no-backfill, frozen prices, settlement and ROI/A-E", async () => {
  const models=await legacyModels(), card=race();
  const meetings=[{courseId:"course",courseSourceId:"278",courseName:"Newcastle",country:"GB",order:1,races:[card]}];
  const rows=buildRankOneObservations({meetings,raceDate:date,capturedAt:at,models}); assert.equal(rows.length,1);
  assert.equal(rows[0]!.modelProbability, book(card)!.runners.find(r => r.runnerId === rows[0]!.runnerId)!.probability);
  assert.equal(rows[0]!.liveSemanticsVersion,AW_TISSUE_V2_SCORER); assert.equal(rows[0]!.modelInputs!.length,95);
  assert.equal(rows[0]!.market.medianBookmakerDecimal,4); assert.equal(rows[0]!.market.marketRank,2);
  const data=appendRankOne(emptyRankOne(),rows); assert.equal(appendRankOne(data,[{...rows[0]!,runnerId:"different"}]),data);
  const result={...card,actualRunnerCount:2,runners:card.runners.map(r=>({...r,resultStatus:"finished",finishingPosition:r.runnerId==="a"?1:2}))};
  const settled=settleRankOne(data,new Map([[card.raceId,result]]),new Date(off.getTime()+1));
  const metrics=rankOneMetrics(settled.observations); assert.equal(metrics.roi,3); assert.equal(metrics.strikeRate,1); assert.equal(metrics.ae,3);
  const legacyRow={...settled.observations[0]!,family:"TURF" as const}; assert.deepEqual(rankOneMetrics([legacyRow]),metrics);
  const legacy={...rows[0]!,raceId:"old",liveSemanticsVersion:undefined,liveSemanticsEffectiveAt:undefined,rankSource:"AW Tissue / AW_TISSUE_V1 / rank"};
  const summaries=summarizeRankOne({...data,observations:[...rows,legacy]});
  if(AW_TISSUE_V2_ACTIVE) assert.deepEqual(summaries.filter(s=>s.family==="AW").map(s=>s.tracked),[1,1]);
  // Book settlement preserves the captured input, using the same established AW settlement implementation.
  const frozen=book()!,input=JSON.stringify(frozen.runners.map(r=>r.modelInputs));
  const final=settleAwTissueRace(frozen,result,new Date(off.getTime()+1));assert(final.settledAt);assert.equal(JSON.stringify(final.runners.map(r=>r.modelInputs)),input);
});
test("old artifacts remain separate immutable evidence", async()=>{
  const v1=JSON.parse(await readFile("data/research/aw-tissue-model-v1.json","utf8"));
  assert.equal(v1.version,"AW_TISSUE_V1");assert.equal(v1.model.names.length,32);assert.notEqual(v1.checksum,model.checksum);
});
test("AW core ratings and six missing flags use AW only, retaining mixed-family L3 slots",()=>{
  const speed={rating:100,method:"base",confidence:"high",baseRating:100,sameDayAdjustedRating:null,cumulativeBeatenLengths:0,standardSampleSize:20,sameDaySampleSize:null,unavailableReason:null,withheldReason:null,standardSeconds:100,equivalentTimeSeconds:99,secondsPerLength:.15} as const;
  const run=(family:"aw"|"turf",day:number,rating:number):HistoricalRunInput=>({horseId:"a",courseId:"course",raceDate:new Date(at.getTime()-day*86400000).toISOString().slice(0,10),raceDateTime:new Date(at.getTime()-day*86400000),distanceYards:1760,going:"Good",finishingPosition:2,resultStatus:"finished",racingPostRating:null,topspeedRating:null,officialRating:null,weightCarriedLbs:140,awSpeedRating:family==="aw"?{...speed,rating,calculationVersion:"aw_speed_v1"}:null,turfSpeedRating:family==="turf"?{...speed,rating,calculationVersion:"turf_speed_v2"}:null});
  const card=race(),r=card.runners[1]!;
  r.weightCarriedLbs=130;r.metrics=calculateHorseMetricsAsOf({runs:[run("turf",1,999),run("aw",2,100),run("aw",3,80),run("aw",4,300)],beforeDateTime:at,targetWeightCarriedLbs:130});
  const vector=awV2NumericVector(awV2LiveFeatureInput(card,r),context().surfaceByRunner.get("a")!);
  [1,2,3,7,8,9].forEach((j,i)=>{assert.equal(vector[j],[72,72,62,110,110,100][i]);assert.equal(vector[j+26],0);});
  r.metrics=calculateHorseMetricsAsOf({runs:[run("turf",1,999),run("turf",2,888),run("turf",3,777),run("aw",4,100)],beforeDateTime:at,targetWeightCarriedLbs:130});
  const missing=awV2NumericVector(awV2LiveFeatureInput(card,r),context().surfaceByRunner.get("a")!);
  assert.equal(missing[1],72);for(const j of [2,3,8,9]){assert.equal(missing[j],0);assert.equal(missing[j+26],1);}
});
test("AW v2 persistence rejects pre-epoch, wrong-model or nonfinite input books",()=>{
  const data=emptyAwV2Forward(),record=book()!;
  for(const change of [(r:typeof record)=>{r.recordedAt=new Date(Date.parse(AW_TISSUE_V2_EPOCH)-1).toISOString();},(r:typeof record)=>{r.modelVersion="AW_TISSUE_V1";},(r:typeof record)=>{r.runners[0]!.modelInputs![0]=NaN;}]){
    const bad=structuredClone(record);change(bad);assert.equal(captureAwV2Races(data,[bad]).races.length,0);
  }
});
