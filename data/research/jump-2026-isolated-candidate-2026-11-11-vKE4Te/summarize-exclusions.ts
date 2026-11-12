import { readFile } from "node:fs/promises";
import { isJumpRace } from "@/lib/racing/jump-speed-rating";
import { json, save, ROOT, FROM, TO, type Race, type Runner } from "./common";
import type { HistoricalPreRaceFeatureRow } from "@/lib/racing/historical-target-metrics";
const v=await json<{candidate:string}>(`${ROOT}/validation.json`);
const features=(await readFile(`${v.candidate}/features.ndjson`,"utf8")).trim().split("\n").map(l=>JSON.parse(l) as HistoricalPreRaceFeatureRow);
const eligibility=(await readFile(`${ROOT}/eligibility.ndjson`,"utf8")).trim().split("\n").map(l=>JSON.parse(l) as {runnerId:string;referenceEligible:boolean;threeBestL3Finite:boolean;strictExploratoryUsable:boolean;ratingsL3Clear:boolean;definiteUntimedPriorIds:string[];uncertainPriorIds:string[];hiddenActualL3Ids:string[];potentialL3ContextIds:string[];potentialAnyContextCount:number;targetTimeMissing:boolean;settlementState:string});
const races=await json<Race[]>(`${ROOT}/database-races.json`),runners=await json<Runner[]>(`${ROOT}/database-runners.json`),byRace=new Map(races.map(r=>[r.id,r])),byRunner=new Map(runners.map(r=>[r.id,r]));
const actualRaceIds=new Set(features.map(f=>f.targetRaceId));
const preliminaryOnly=races.filter(r=>r.date>=FROM&&r.date<=TO&&!actualRaceIds.has(r.id)&&isJumpRace({raceName:r.name,raceType:r.type,courseName:r.course}));
const unique=(key:"definiteUntimedPriorIds"|"uncertainPriorIds"|"hiddenActualL3Ids")=>[...new Set(eligibility.flatMap(r=>r[key]))].map(id=>({...byRunner.get(id)!,race:byRace.get(byRunner.get(id)!.race_id)}));
const definite=unique("definiteUntimedPriorIds"),uncertain=unique("uncertainPriorIds"),hidden=unique("hiddenActualL3Ids");
const exclusions={
 allRows:eligibility.length,
 noCompleteThreeL3:eligibility.filter(r=>!r.threeBestL3Finite).length,
 sourceOrOutcomeExclusions:eligibility.filter(r=>["NR","void","unresolved"].includes(r.settlementState)).length,
 targetUntimed:eligibility.filter(r=>r.targetTimeMissing).length,
 anyDefiniteUntimedPrior:eligibility.filter(r=>r.definiteUntimedPriorIds.length).length,
 anyUncertainPriorEvidence:eligibility.filter(r=>r.uncertainPriorIds.length).length,
 hiddenActualL3:eligibility.filter(r=>r.hiddenActualL3Ids.length).length,
 potentialL3Context:eligibility.filter(r=>r.potentialL3ContextIds.length).length,
 potentialAnyContext:eligibility.filter(r=>r.potentialAnyContextCount).length,
 referenceEligibleButDependencyScreened:eligibility.filter(r=>r.referenceEligible&&!r.strictExploratoryUsable).length,
 strictUsable:eligibility.filter(r=>r.strictExploratoryUsable).length,
 overlappingReasons:true,
};
await save("exclusion-summary.json",{exclusions,definiteMissingRuns:definite,uncertainHistoricalRecords:uncertain,hiddenActualL3Runs:hidden,preliminaryMetadataOnly:preliminaryOnly,
 scopeReconciliation:"The broader preflight isJumpRace heuristic is a superset of the existing builder's targetFamilyCondition SQL. Its three additional races/27 rows were never members of the original scoped cache or the stock builder candidate. No additional target filter was introduced."});
console.log(JSON.stringify({exclusions,definiteMissingRunRecords:definite.length,definiteMissingRaces:new Set(definite.map(r=>r.race_id)).size,uncertainHistoricalRecords:uncertain.length,uncertainRaces:new Set(uncertain.map(r=>r.race_id)).size,hiddenActualL3Runs:hidden.length,preliminaryMetadataOnly:preliminaryOnly.map(r=>({sourceId:r.source_id,name:r.name,date:r.date}))},null,2));
