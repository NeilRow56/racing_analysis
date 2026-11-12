import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { cacheDirectory, isCompatibleManifest, loadBacktestFeatureCache, type BacktestFeatureCacheManifest } from "@/lib/racing/backtest-cache";
import { calculateHorseMetricsAsOf, type HistoricalRunInput, type HorseMetricsAsOf } from "@/lib/racing/horse-metrics";
import { isJumpRace, type JumpSpeedRating } from "@/lib/racing/jump-speed-rating";
import { withHistoricalSettlementEvidence } from "@/lib/racing/historical-settlement-evidence";
import { settleSelection } from "@/lib/racing/backtest";
import { settlementOutcomeState } from "@/lib/racing/settlement-outcome";
import { assertEpochSources, loadEpochManifest } from "@/lib/racing/prospective-epoch-integrity";
import type { HistoricalPreRaceFeatureRow, HistoricalPostRaceOutcome } from "@/lib/racing/historical-target-metrics";
import { ROOT, OLD, FROM, TO, json, save, type Race, type Runner } from "./common";
const directory=cacheDirectory({outputDir:`${ROOT}/cache`,from:FROM,to:TO,family:"jump",source:"sporting_life"});
async function ndjson<T>(path:string):Promise<T[]> {return (await readFile(path,"utf8")).trim().split("\n").filter(Boolean).map(l=>JSON.parse(l) as T);}
const manifest=await json<BacktestFeatureCacheManifest>(`${directory}/manifest.json`);
assert.ok(isCompatibleManifest(manifest,{from:FROM,to:TO,family:"jump"}));
assert.equal(manifest.settlementVersion,"canonical_settlement_v3");
const loaded=await loadBacktestFeatureCache({from:FROM,to:TO,family:"jump",outputDir:`${ROOT}/cache`});assert.ok(loaded);
const features=loaded.rows.map(r=>r.features),outcomes=loaded.rows.map(r=>r.outcome);
const oldFeatures=await ndjson<HistoricalPreRaceFeatureRow>(`${OLD}/features.ndjson`),oldOutcomes=await ndjson<HistoricalPostRaceOutcome>(`${OLD}/outcomes.ndjson`);
const races=await json<Race[]>(`${ROOT}/database-races.json`),runners=await json<Runner[]>(`${ROOT}/database-runners.json`),ratings=await json<Record<string,JumpSpeedRating>>(`${ROOT}/prior-ratings.json`);
const byRace=new Map(races.map(r=>[r.id,r]));
// Existing identity-bound read-time evidence adapter; original prices/positions/features stay exact.
const oldAnnotated=withHistoricalSettlementEvidence(oldFeatures.map((features,i)=>({features,outcome:oldOutcomes[i]})),runners.map(r=>({runnerId:r.id,raceId:r.race_id,horseId:r.horse_id,source:"sporting_life",raceDate:byRace.get(r.race_id)!.date,raceStage:byRace.get(r.race_id)!.stage,outcomeCode:r.outcome_code,finishingPosition:r.finishing_position,resultStatus:r.result_status})));
const oldById=new Map(oldAnnotated.map(row=>[row.features.targetRunnerId,row]));
const targetIds=new Set(features.map(f=>f.targetRunnerId)),actualRaces=new Set(features.map(f=>f.targetRaceId));
assert.equal(new Set(features.map(f=>f.targetRunnerId)).size,features.length);
assert.equal(new Set(features.map(f=>`${f.targetRaceId}|${f.horseId}`)).size,features.length);
assert.equal(new Set(outcomes.map(o=>o.targetRunnerId)).size,outcomes.length);
assert.ok(features.every((f,i)=>f.targetRunnerId===outcomes[i].targetRunnerId&&f.targetRaceId===outcomes[i].targetRaceId&&f.raceDate>=FROM&&f.raceDate<=TO));
const history=new Map<string,Runner[]>();for(const r of runners){const list=history.get(r.horse_id)??[];list.push(r);history.set(r.horse_id,list);}
for(const rows of history.values()) rows.sort((a,b)=>Date.parse(byRace.get(b.race_id)!.at)-Date.parse(byRace.get(a.race_id)!.at)||a.id.localeCompare(b.id));
const terminal=new Set(["WEIGHEDIN","OFFICIAL","COMPLETED"]),voids=new Set(["RACEVOID","ABANDONED","CANCELLED","CANCELED","VOID","NORACE"]);
const isNR=(r:Runner)=>["non_runner","nr","withdrawn"].includes((r.result_status??"").toLowerCase());
const gapRaces=races.filter(r=>!r.winning_time?.trim()&&!voids.has(r.stage??"")&&isJumpRace({raceName:r.name,raceType:r.type,raceTypeCode:r.type_code,courseName:r.course}));
const earliestGap=new Map<string,number>();for(const r of gapRaces)earliestGap.set(r.course_id,Math.min(earliestGap.get(r.course_id)??Infinity,Date.parse(r.at)));
const recoveredIds=new Set((await json<{recovered:{raceId:string}[]}>(`${ROOT}/prebuild.json`)).recovered.map(r=>r.raceId));
const earliestRecovery=new Map<string,number>();for(const id of recoveredIds){const r=byRace.get(id)!;earliestRecovery.set(r.course_id,Math.min(earliestRecovery.get(r.course_id)??Infinity,Date.parse(r.at)));}
const ratingFields=["latestSpeedRating","previousSpeedRating","bestSpeedLast3","averageSpeedLast3","bestSpeedLast5","latestPerformanceRating","previousPerformanceRating","bestPerformanceLast3","averagePerformanceLast3","bestPerformanceLast5","latestTodaysRating","previousTodaysRating","bestTodaysRatingLast3","averageTodaysRatingLast3","bestTodaysRatingLast5"] as const;
const mapping: [typeof ratingFields[number], keyof HorseMetricsAsOf][]=[
 ["latestSpeedRating","latestJumpSpeedRating"],["previousSpeedRating","previousJumpSpeedRating"],["bestSpeedLast3","bestJumpSpeedLast3"],["averageSpeedLast3","averageJumpSpeedLast3"],["bestSpeedLast5","bestJumpSpeedLast5"],
 ["latestPerformanceRating","latestJumpPerformanceRating"],["previousPerformanceRating","previousJumpPerformanceRating"],["bestPerformanceLast3","bestJumpPerformanceLast3"],["averagePerformanceLast3","averageJumpPerformanceLast3"],["bestPerformanceLast5","bestJumpPerformanceLast5"],
 ["latestTodaysRating","latestJumpTodaysRating"],["previousTodaysRating","previousJumpTodaysRating"],["bestTodaysRatingLast3","bestJumpTodaysRatingLast3"],["averageTodaysRatingLast3","averageJumpTodaysRatingLast3"],["bestTodaysRatingLast5","bestJumpTodaysRatingLast5"]];
const differs=(a:unknown,b:unknown)=>a===null||b===null?a!==b:typeof a==="number"&&typeof b==="number"?Math.abs(a-b)>1e-8:JSON.stringify(a)!==JSON.stringify(b);
const fieldStats=Object.fromEntries(ratingFields.map(k=>[k,{unchanged:0,changed:0,nullToFinite:0,finiteToNull:0,finiteToFinite:0,maxAbsDelta:0,sumAbsDelta:0}]));
const comparison:unknown[]=[],eligibility:Record<string,unknown>[]=[],aggregationMismatches:unknown[]=[],chronologyViolations:unknown[]=[],historyGaps:unknown[]=[];
const missingFeatures=Object.fromEntries(ratingFields.map(k=>[k,0]));
const counts:Record<string,number>={candidate:features.length,settleable:0,completeThreeBestL3:0,settleableCompleteThreeBestL3:0,strictExploratoryUsable:0,ratingsL3Usable:0,void:0,NR:0,unresolved:0,nonFinisherLosses:0,deadHeatWinners:0,anyRatingChanged:0,guardV2ExposedChanged:0,recoveryExposedChanged:0,unattributedChanged:0,oldReferenceEligible:0,newReferenceEligible:0,gainedReferenceEligibility:0,lostReferenceEligibility:0};
const bands=["(1,3]","(3,6]","(6,11]","(11,21]",">21","unknown/invalid"];
const bandStats=Object.fromEntries(bands.map(b=>[b,{records:0,settleable:0,winners:0,completeL3Settleable:0,completeL3Winners:0,strictUsable:0,strictWinners:0,excludedStrict:0}]));
const winningPrices:number[]=[],longWinnerExamples:unknown[]=[];
for(const [i,f] of features.entries()) {
 const at=f.raceDateTime.getTime(),o=outcomes[i],race=byRace.get(f.targetRaceId)!;
 const allPrior=(history.get(f.horseId)??[]).filter(r=>Date.parse(byRace.get(r.race_id)!.at)<at);
 const known=allPrior.filter(r=>!isNR(r)&&(r.finishing_position!==null||r.result_status!==null));
 const prior=known.filter(r=>byRace.get(r.race_id)!.winning_time?.trim());
 const last3=prior.slice(0,3);
 const definiteMissing=known.filter(r=>{const p=byRace.get(r.race_id)!;return !p.winning_time?.trim()&&terminal.has(p.stage??"");});
 const uncertain=allPrior.filter(r=>{const p=byRace.get(r.race_id)!;return !isNR(r)&&!voids.has(p.stage??"")&&(!p.full_count||!terminal.has(p.stage??""));});
 const actualWindow=known.filter(r=>!voids.has(byRace.get(r.race_id)!.stage??"")).slice(0,3);
 const hiddenL3=actualWindow.filter(r=>!byRace.get(r.race_id)!.winning_time?.trim());
 const contextRisk=(r:Runner)=>{const p=byRace.get(r.race_id)!;return isJumpRace({raceName:p.name,raceType:p.type})&&Date.parse(p.at)>=(earliestGap.get(p.course_id)??Infinity);};
 const l3Context=last3.filter(contextRisk),anyContext=prior.filter(contextRisk);
 const guardV2=prior.filter(r=>ratings[r.id]?.winningTimeReview?.missingMinute.classification==="LIKELY_MISSING_MINUTE"&&!ratings[r.id]?.winningTimeReview?.genericShouldWithhold);
 const recovery=prior.filter(r=>recoveredIds.has(r.race_id)||Date.parse(byRace.get(r.race_id)!.at)>=(earliestRecovery.get(byRace.get(r.race_id)!.course_id)??Infinity));
 const inputRuns:HistoricalRunInput[]=prior.map(r=>{const p=byRace.get(r.race_id)!;return {source:"sporting_life",runnerId:r.id,horseId:r.horse_id,raceDateTime:new Date(p.at),raceDate:p.date,raceName:p.name,raceType:p.type,courseId:p.course_id,courseName:p.course,distanceYards:p.distance,going:null,finishingPosition:r.finishing_position,resultStatus:r.result_status,racingPostRating:null,topspeedRating:null,officialRating:r.official_rating,weightCarriedLbs:r.weight,jumpSpeedRating:ratings[r.id]??null};});
 if(inputRuns.some(r=>r.raceDateTime>=f.raceDateTime))chronologyViolations.push(f.targetRunnerId);
 const rebuilt=calculateHorseMetricsAsOf({runs:inputRuns,beforeDateTime:f.raceDateTime,targetCourseId:f.courseId,targetDistanceYards:f.distanceYards,targetGoing:f.going,targetWeightCarriedLbs:f.weightCarriedLbs});
 for(const [key,metric] of mapping) {if(differs(f[key],rebuilt[metric])) aggregationMismatches.push({runnerId:f.targetRunnerId,field:key,candidate:f[key],recomputed:rebuilt[metric]}); if(f[key]===null)missingFeatures[key]++;}
 const triple=[f.bestSpeedLast3,f.bestPerformanceLast3,f.bestTodaysRatingLast3].every(v=>typeof v==="number"&&Number.isFinite(v));
 const settlement=settleSelection(o),state=settlementOutcomeState(o);if(settlement)counts.settleable++; if(triple)counts.completeThreeBestL3++;if(triple&&settlement)counts.settleableCompleteThreeBestL3++;
 if(state==="void")counts.void++;if(state==="NR")counts.NR++;if(state==="unresolved")counts.unresolved++;
 if(state==="loss"&&o.finishingPosition===null)counts.nonFinisherLosses++;
 if(state==="win"&&(o.deadHeatDivisor??1)>1) {counts.deadHeatWinners++; assert.equal(settlement?.grossReturn,Number(o.startingPriceDecimal)/(o.deadHeatDivisor??1));}
 if(state==="void"||state==="NR"||state==="unresolved")assert.equal(settlement,null);
 if(settlement&&state==="win") {const price=Number(o.startingPriceDecimal);winningPrices.push(price);if(price>21) {assert.equal(settlement.grossReturn,price/(o.deadHeatDivisor??1));longWinnerExamples.push({runnerId:f.targetRunnerId,horse:f.horseName,sp:price,divisor:o.deadHeatDivisor??1,grossReturn:settlement.grossReturn});}}
 const ratingsClear=hiddenL3.length===0&&l3Context.length===0;
 const strict=ratingsClear&&definiteMissing.length===0&&uncertain.length===0&&anyContext.length===0;
 const eligible=!!settlement&&triple;
 if(eligible&&strict)counts.strictExploratoryUsable++;if(eligible&&ratingsClear)counts.ratingsL3Usable++;
 const old=oldById.get(f.targetRunnerId),changed=old?ratingFields.filter(k=>differs(old.features[k],f[k])):[];
 if(old) {
  const oldEligible=!!settleSelection(old.outcome)&&[old.features.bestSpeedLast3,old.features.bestPerformanceLast3,old.features.bestTodaysRatingLast3].every(v=>typeof v==="number"&&Number.isFinite(v));
  if(oldEligible)counts.oldReferenceEligible++;if(eligible)counts.newReferenceEligible++;if(!oldEligible&&eligible)counts.gainedReferenceEligibility++;if(oldEligible&&!eligible)counts.lostReferenceEligibility++;
  for(const k of ratingFields){const s=fieldStats[k],a=old.features[k],b=f[k];if(!differs(a,b)){s.unchanged++;continue;}s.changed++;if(a===null)s.nullToFinite++;else if(b===null)s.finiteToNull++;else{s.finiteToFinite++;s.maxAbsDelta=Math.max(s.maxAbsDelta,Math.abs(b-a));s.sumAbsDelta+=Math.abs(b-a);}}
 }
 if(changed.length){counts.anyRatingChanged++;if(guardV2.length)counts.guardV2ExposedChanged++;if(recovery.length)counts.recoveryExposedChanged++;if(!guardV2.length&&!recovery.length)counts.unattributedChanged++;
  comparison.push({runnerId:f.targetRunnerId,raceId:f.targetRaceId,horse:f.horseName,date:f.raceDate,fields:changed.map(k=>({field:k,old:old!.features[k],candidate:f[k]})),guardV2PriorIds:guardV2.map(r=>r.id),recoveryPossiblePriorIds:recovery.map(r=>r.id),attribution:guardV2.length||recovery.length?"documented_exposure_not_exclusive_causality":"requires_investigation"});}
 const p=Number(o.startingPriceDecimal),band=!(p>1)||!Number.isFinite(p)?bands[5]:p<=3?bands[0]:p<=6?bands[1]:p<=11?bands[2]:p<=21?bands[3]:bands[4],b=bandStats[band];b.records++;if(settlement)b.settleable++;if(settlement&&state==="win")b.winners++;if(eligible){b.completeL3Settleable++;if(state==="win")b.completeL3Winners++;}if(eligible&&strict){b.strictUsable++;if(state==="win")b.strictWinners++;}else b.excludedStrict++;
 eligibility.push({runnerId:f.targetRunnerId,raceId:f.targetRaceId,horse:f.horseName,date:f.raceDate,sourceFullResult:race.full_count===1,targetTimeMissing:!race.winning_time?.trim(),settlementState:state,validSP:p>1&&Number.isFinite(p),threeBestL3Finite:triple,referenceEligible:eligible,ratingsL3Clear:ratingsClear,strictExploratoryUsable:eligible&&strict,
  definiteUntimedPriorIds:definiteMissing.map(r=>r.id),uncertainPriorIds:uncertain.map(r=>r.id),hiddenActualL3Ids:hiddenL3.map(r=>r.id),potentialL3ContextIds:l3Context.map(r=>r.id),potentialAnyContextCount:anyContext.length,guardV2PriorIds:guardV2.map(r=>r.id),builderLast3Ids:last3.map(r=>r.id)});
 if(definiteMissing.length||uncertain.length||hiddenL3.length)historyGaps.push({runnerId:f.targetRunnerId,horse:f.horseName,date:f.raceDate,definiteUntimedPriorIds:definiteMissing.map(r=>r.id),uncertainPriorIds:uncertain.map(r=>r.id),hiddenActualL3Ids:hiddenL3.map(r=>r.id)});
}
const newlyIncluded=features.filter(f=>!oldById.has(f.targetRunnerId)),missingOldScoped=oldFeatures.filter(f=>f.raceDate<=TO&&!targetIds.has(f.targetRunnerId));
const sourceIssues=features.filter(f=>byRace.get(f.targetRaceId)?.full_count!==1);
const priorStageCounts:Record<string,number>={};for(const r of runners){const p=byRace.get(r.race_id)!;if(!p.winning_time?.trim())priorStageCounts[p.stage??"missing full result"]=(priorStageCounts[p.stage??"missing full result"]??0)+1;}
const epoch=await loadEpochManifest();assert.ok(epoch);await assertEpochSources(epoch);
const files:Record<string,string>={};for(const file of ["manifest.json","features.ndjson","outcomes.ndjson"]){files[file]=createHash("sha256").update(await readFile(`${directory}/${file}`)).digest("hex");}
await writeFile(`${ROOT}/eligibility.ndjson`,eligibility.map(r=>JSON.stringify(r)+"\n").join(""));
await save("rating-comparison.json",{fields:fieldStats,changedRows:comparison,newlyIncluded,missingOldScoped});
await save("history-dependencies.json",{policy:"Conservative advisory sidecar only; raw builder observations are retained. Earlier non-final evidence is uncertain, never fabricated. Potential course context is a broad upper-bound screen, not proven numerical harm.",gapRaces,priorStageCounts,rows:historyGaps});
const investigation=await json<{groups:Record<string,number>}>(`${ROOT}/difference-investigation.json`).catch(error=>{if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;});
counts.firstPassUnattributedChanged=counts.unattributedChanged;delete counts.unattributedChanged;
if(investigation){counts.guardDependencyPathChanged=investigation.groups.identified_V2_guard_dependency_path??0;counts.recoveryDependencyPathChanged=investigation.groups.identified_recovery_dependency_path??0;counts.unexplainedAfterContextTrace=investigation.groups.unexplained_after_dependency_screen??0;}
await save("validation.json",{candidate:directory,manifest,compatible:true,settlementVersion:"canonical_settlement_v3",coverage:{rows:features.length,races:actualRaces.size,from:features[0].raceDate,to:features.at(-1)?.raceDate,firstTargetAt:features[0].raceDateTime.toISOString(),lastTargetAt:features.at(-1)?.raceDateTime.toISOString()},original:{rows:oldFeatures.length,races:new Set(oldFeatures.map(f=>f.targetRaceId)).size,scopedRows:oldFeatures.filter(f=>f.raceDate<=TO).length},counts,missingFeatures,priceBands:bandStats,
 duplicateRunnerIdentities:0,duplicateRaceHorseIdentities:0,identityMismatches:0,chronologyViolations,aggregationMismatches,missingTargetSource:sourceIssues.map(f=>f.targetRunnerId),newlyIncluded: newIncludeSummary(newlyIncluded),missingOldScoped:missingOldScoped.map(f=>f.targetRunnerId),maxWinnerSP:Math.max(...winningPrices),longWinnerExamples:longWinnerExamples.sort((a,b)=>Number((b as {sp:number}).sp)-Number((a as {sp:number}).sp)).slice(0,10),files,prospectiveEpochPinsValid:true,exploratoryOnly:true,activated:false,dependencyIntegrity:"Qualified only: identified historical source gaps and original publication/context lineage limitations remain",releaseRecommendation:"Withhold unfiltered Research Filters release; separately review the strict exploratory subset and required sidecar integration",
  eligibilityDefinition:"Old outcome evidence is annotated in memory by the existing identity-bound adapter; original positions, SPs and features are retained. Reference coverage = Canonical V3 settleable + finite Best L3 Speed/Performance/Today's Rating, without strategy thresholds. Strict usable further excludes all identified direct/uncertain/context dependencies. These are validation subsets, not modifications to research rules.",
  ratingFeatureDefinitions:"Historical-target-metrics diff is outcome-evidence annotations only; unchanged existing Horse Metrics, Jump Speed, Performance and Today's Rating functions are used. Independent history aggregation rechecks all 15 comparison fields for every row."});
console.log(JSON.stringify({rows:features.length,races:actualRaces.size,counts,aggregationMismatches:aggregationMismatches.length,sourceIssues:sourceIssues.length,priceBands:bandStats},null,2));
function newIncludeSummary(rows:HistoricalPreRaceFeatureRow[]){return rows.map(f=>({runnerId:f.targetRunnerId,raceId:f.targetRaceId,horse:f.horseName,date:f.raceDate}));}
