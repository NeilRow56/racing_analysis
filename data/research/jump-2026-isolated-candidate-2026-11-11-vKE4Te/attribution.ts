import { jumpWinningTimeReviews } from "@/lib/racing/jump-winning-time-references";
import { isJumpRace } from "@/lib/racing/jump-speed-rating";
import { readFile } from "node:fs/promises";
import { json, save, ROOT, type Race, type Runner } from "./common";
import type { JumpSpeedRating } from "@/lib/racing/jump-speed-rating";
const races=await json<Race[]>(`${ROOT}/database-races.json`),runners=await json<Runner[]>(`${ROOT}/database-runners.json`),ratings=await json<Record<string,JumpSpeedRating>>(`${ROOT}/prior-ratings.json`);
const byRace=new Map(races.map(r=>[r.id,r])),byRunner=new Map(runners.map(r=>[r.id,r]));
const newGuardRaceIds=new Set(Object.entries(ratings).filter(([,r])=>r.winningTimeReview?.missingMinute.classification==="LIKELY_MISSING_MINUTE"&&!r.winningTimeReview.genericShouldWithhold).map(([id])=>byRunner.get(id)!.race_id));
const guardRaces=[...newGuardRaceIds].map(id=>byRace.get(id)!);
const prebuild=await json<{corrections:{sourceId:string}[];recovered:{raceId:string}[]}>(`${ROOT}/prebuild.json`);
const corrections=prebuild.corrections.map(c=>races.find(r=>r.source_id===c.sourceId)!);
const recovered=prebuild.recovered.map(c=>byRace.get(c.raceId)!);
const changes=await json<{changedRows:{runnerId:string;date:string;horse:string;attribution:string}[]}>(`${ROOT}/rating-comparison.json`);
const eligible=(await readFile(`${ROOT}/eligibility.ndjson`,"utf8")).trim().split("\n").map(l=>JSON.parse(l) as {runnerId:string;builderLast3Ids:string[]});
const last3=new Map(eligible.map(r=>[r.runnerId,r.builderLast3Ids]));
function pathways(prior:Race,events:Race[]) {
 const at=Date.parse(prior.at),sameDay=races.filter(r=>r.course_id===prior.course_id&&r.date===prior.date&&Date.parse(r.at)<=at);
 return events.flatMap(event=>{
  if(event.course_id!==prior.course_id||Date.parse(event.at)>at)return [];
  const path=event.id===prior.id?"rated_race":event.distance===prior.distance?"same_course_distance_standard":sameDay.some(r=>r.distance===event.distance)?"meeting_peer_standard":null;
  return path?[{sourceId:event.source_id,raceId:event.id,priorRaceId:prior.id,path}]:[];
 });
}

const courseRows=new Map<string,Race[]>();for(const r of races){if(!r.winning_time?.trim()||!isJumpRace({raceName:r.name,raceType:r.type}))continue;const rows=courseRows.get(r.course_id)??[];rows.push(r);courseRows.set(r.course_id,rows);}
const dynamicCache=new Map<string,ReturnType<typeof pathways>>();
function dynamicGuardPaths(prior:Race) {
 const cached=dynamicCache.get(prior.id);if(cached)return cached;
 const contexts=(courseRows.get(prior.course_id)??[]).filter(r=>Date.parse(r.at)<=Date.parse(prior.at));
 const reviews=jumpWinningTimeReviews(contexts.map(r=>({raceId:r.id,courseId:r.course_id,distanceYards:r.distance,winningTime:r.winning_time,raceName:r.name,raceType:r.type})));
 const dynamicallyFlagged=contexts.filter(r=>{const review=reviews.get(r.id);return review?.missingMinute.classification==="LIKELY_MISSING_MINUTE"&&!review.genericShouldWithhold;});
 const result=pathways(prior,dynamicallyFlagged);dynamicCache.set(prior.id,result);return result;
}

const rows=changes.changedRows.map(row=>{
 const target=byRunner.get(row.runnerId)!;
 const targetAt=Date.parse(byRace.get(target.race_id)!.at);
 const priorRows=runners.filter(r=>r.horse_id===target.horse_id&&Date.parse(byRace.get(r.race_id)!.at)<targetAt&&ratings[r.id]);
 const recentIds=new Set(last3.get(row.runnerId));
 const guardPaths=priorRows.flatMap(r=>dynamicGuardPaths(byRace.get(r.race_id)!).map(p=>({...p,priorRunnerId:r.id,inBuilderLast3:recentIds.has(r.id)})));
 const correctionPaths=priorRows.flatMap(r=>pathways(byRace.get(r.race_id)!,corrections).map(p=>({...p,priorRunnerId:r.id,inBuilderLast3:recentIds.has(r.id)})));
 const recoveryPaths=priorRows.flatMap(r=>pathways(byRace.get(r.race_id)!,recovered).map(p=>({...p,priorRunnerId:r.id,inBuilderLast3:recentIds.has(r.id)})));
 return {...row,guardPaths,correctionPaths,recoveryPaths,classification:guardPaths.length?"identified_V2_guard_dependency_path":recoveryPaths.length?"identified_recovery_dependency_path":correctionPaths.length?"correction_path_requires_original_context_proof":"unexplained_after_dependency_screen"};
});
const groups:Record<string,number>={};for(const r of rows)groups[r.classification]=(groups[r.classification]??0)+1;
await save("difference-investigation.json",{policy:"As-of direct, same-course/distance and meeting-peer-standard dependency tracing without disabling or replacing the guard. Paths establish causal possibility, not exclusive numerical counterfactuals. The original cache does not retain complete per-rating context hashes.",guardRacesAtOwnHistoricalCutoff:guardRaces,dynamicContextAudits:dynamicCache.size,groups,rows});
console.log(JSON.stringify({groups,guardRaces:guardRaces.length}));
