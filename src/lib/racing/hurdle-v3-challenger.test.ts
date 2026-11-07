import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "./__fixtures__/hurdle-v3-avatar-regression.json";
import { buildHurdleV3Runner, buildHurdleV3Field, canonicalHurdleV3Starter, hurdleV3PriorHistory, HURDLE_V3_CORE, type HurdleV3Prior, type HurdleV3Target, type HurdleV3Raw } from "./hurdle-v3-challenger-features";
import { loadHurdleV3Challenger, scoreHurdleV3Field, validateHurdleV3Model } from "./hurdle-v3-challenger-model";
import { loadTissueGenerationModels, GENERATION_MODEL_VERSIONS } from "./tissue-generation-model";

const target: HurdleV3Target = { runnerId:"target",raceId:"target-race",cutoff:"2026-11-07T04:41:10.004Z",scheduledOff:"2026-11-07T12:15:00.000Z",officialRating:null,age:5,weightLbs:154,
  trainer:{starts:739,wins:59,latestAt:"2026-11-05T18:00:00Z"},jockey:{starts:30,wins:9,latestAt:"2026-11-06T12:25:00Z"} };
const run = (overrides: Partial<HurdleV3Prior>={}):HurdleV3Prior => ({runnerId:"old",raceId:"old-race",family:"HURDLE",at:"2026-10-17T15:23:00Z",finishingPosition:3,resultStatus:"finished",speed:100,comment:"stayed on",...overrides});

test("Flat/AW/Chase/Bumper history cannot fabricate Hurdle starts, Speed, completion or comments",()=>{
  const history=["TURF","AW","CHASE","NH FLAT"].map((family,i)=>run({runnerId:String(i),family,speed:200,comment:"blundered, stayed on strongly"}));
  const r=buildHurdleV3Runner(target,history);assert.equal(r.provenance.priorHurdleStarts,0);assert.equal(r.raw.log_prior_hurdle_starts,0);
  for(const n of ["latest_hurdle_speed","best_l3_hurdle_speed","average_l3_hurdle_speed","completed_last3_hurdle_fraction"] as const)assert.equal(r.raw[n],null);
  assert.equal(r.raw.hurdle_history_missing,1);assert.equal(r.raw.hurdle_speed_missing_with_history,0);
  assert.equal(r.raw.hurdle_comment_finish_recent,0);assert.equal(r.raw.hurdle_comment_jump_error_recent,0);assert.equal(r.provenance.commentRunnerId,null);
});
test("canonical denominators include every settled starter, including DNF, and exclude NR/void/unresolved",()=>{
  for(const resultStatus of ["pulled_up","fell","unseated_rider","brought_down","other"])assert.equal(canonicalHurdleV3Starter({finishingPosition:null,resultStatus}),true);
  for(const resultStatus of ["non_runner","void","abandoned","cancelled","finished",null])assert.equal(canonicalHurdleV3Starter({finishingPosition:null,resultStatus}),false);
  assert.equal(canonicalHurdleV3Starter({finishingPosition:1,resultStatus:"void"}),false);
  assert.equal(buildHurdleV3Runner(target,[]).raw.jockey_starter_win_rate,30);
});
test("same-time, future and target-race source rows are excluded; duplicates are rejected",()=>{
  const rows=[run(),run({runnerId:"same",at:target.cutoff}),run({runnerId:"future",at:"2026-11-08T12:00:00Z"}),run({runnerId:"target",raceId:target.raceId})];
  assert.deepEqual(hurdleV3PriorHistory(target,rows).map(r=>r.runnerId),["old"]);
  assert.throws(()=>hurdleV3PriorHistory(target,[run(),run()]));assert.throws(()=>hurdleV3PriorHistory({...target,cutoff:"2026-11-07T13:00:00Z"},[]));
});
test("latest and L3 Speed refer to the actual latest three Hurdle starts, including unrated nonfinishers",()=>{
  const rows=[run({runnerId:"1",at:"2026-11-01T12:00:00Z",speed:null,finishingPosition:null,resultStatus:"pulled_up"}),run({runnerId:"2",at:"2026-10-20T12:00:00Z",speed:90}),run({runnerId:"3",at:"2026-10-10T12:00:00Z",speed:80}),run({runnerId:"4",at:"2026-10-01T12:00:00Z",speed:300}),run({runnerId:"flat",family:"AW",at:"2026-11-02T12:00:00Z",speed:1000})];
  const r=buildHurdleV3Runner(target,rows);assert.equal(r.raw.latest_hurdle_speed,null);assert.equal(r.raw.best_l3_hurdle_speed,90);assert.equal(r.raw.average_l3_hurdle_speed,85);assert.equal(r.raw.completed_last3_hurdle_fraction,2/3);
});
test("comments are one Hurdle source, age-decayed, expiry-bounded and finish-state exclusive",()=>{
  const r=buildHurdleV3Runner(target,[run({comment:"mistake, stayed on then weakened"}),run({runnerId:"flat",family:"TURF",at:"2026-11-01T12:00:00Z",comment:"kept on strongly"})]);
  assert.equal(r.provenance.commentRunnerId,"old");assert.equal(r.raw.hurdle_comment_finish_recent,0);assert.ok(r.raw.hurdle_comment_weakened_recent!>0);assert.ok(r.raw.hurdle_comment_jump_error_recent!<1);
  const stale=buildHurdleV3Runner(target,[run({at:"2025-01-01T12:00:00Z"})]);assert.equal(stale.provenance.commentRunnerId,null);
});
test("missing-history and missing-speed-with-history gates are mutually exclusive",()=>{
  const empty=buildHurdleV3Runner(target,[]),unrated=buildHurdleV3Runner(target,[run({speed:null})]);
  assert.deepEqual([empty.raw.hurdle_history_missing,empty.raw.hurdle_speed_missing_with_history],[1,0]);assert.deepEqual([unrated.raw.hurdle_history_missing,unrated.raw.hurdle_speed_missing_with_history],[0,1]);
});
test("invalid and future trainer/jockey aggregate priors cannot be scored",()=>{
  assert.throws(()=>buildHurdleV3Runner({...target,jockey:{starts:1,wins:2,latestAt:target.cutoff}},[]));
  assert.throws(()=>buildHurdleV3Runner({...target,trainer:{starts:5,wins:1,latestAt:target.cutoff}},[]));
});
test("fixed 13-runner Avatar probabilities reproduce independent Python scoring; no positive missing package",async()=>{
  const m=await loadHurdleV3Challenger();assert.equal(m.checksum,fixture.modelChecksum);assert.deepEqual(m.selectionProtocol.core,HURDLE_V3_CORE);
  const rows=fixture.runners.map(r=>({runnerId:r.id,raw:r.raw as HurdleV3Raw})),before=JSON.stringify(rows),scored=scoreHurdleV3Field(m,rows);
  for(const r of scored){const expected=fixture.runners.find(t=>t.id===r.runnerId)!;assert.ok(Math.abs(r.probability-expected.v3Probability)<1e-12);assert.equal(r.rank,expected.v3Rank);assert.ok(r.netMissingPackage<=0);}
  assert.equal(JSON.stringify(rows),before);const a=scored.find(r=>r.runnerId===fixture.runners.find(r=>r.horse==="Avatar Jet")!.id)!;assert.equal(a.rank,5);
  for(const n of ["official_rating","latest_hurdle_speed","best_l3_hurdle_speed","average_l3_hurdle_speed","completed_last3_hurdle_fraction"] as const)assert.equal(Math.abs(a.contributions.find(c=>c.name===n)?.contribution??NaN),0);
});
test("artifact tampering is rejected and V3 is not registered as a production family",async()=>{
  const m=await loadHurdleV3Challenger(),bad=structuredClone(m);bad.model.weights[0]+=.01;assert.throws(()=>validateHurdleV3Model(bad));
  assert.equal(GENERATION_MODEL_VERSIONS.HURDLE,"HURDLE_TISSUE_V2");assert.equal((await loadTissueGenerationModels()).HURDLE.checksum,"53defc50d717aba63c80c9f3c01c4df4360b709f6f4a21509a514179e23cce90");
});
test("field-relative candidates use only observed same-field values without mutating inputs",()=>{
  const input=[{target,history:[]},{target:{...target,runnerId:"other",officialRating:100},history:[run()]}],before=JSON.stringify(input);
  const r=buildHurdleV3Field(input);assert.equal(r[0].raw.or_field_percentile,null);assert.equal(r[1].raw.or_field_percentile,null);assert.equal(JSON.stringify(input),before);
});
