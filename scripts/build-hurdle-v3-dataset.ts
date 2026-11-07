import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";
import { classifyJumpRaceSubtype } from "../src/lib/racing/jump-speed-rating";
import { getJumpSpeedRatingsAsOfRuns } from "../src/lib/racing/jump-speed-ratings";
import { buildHurdleV3Field, canonicalHurdleV3Starter, hurdleV3PriorHistory, type HurdleV3Participant, type HurdleV3Prior, type HurdleV3Target } from "../src/lib/racing/hurdle-v3-challenger-features";
import { raceSoftmax, score } from "./diagnose-independent-tissue-feasibility";
import type { TissueGenerationModel } from "../src/lib/racing/tissue-generation-model";
import type { GenerationRace } from "../src/lib/racing/tissue-generation-forward";

const output=resolve(process.argv[2]??"/tmp/hurdle-v3-rebuild"),atlas=resolve(process.argv[3]??"/tmp/winner-atlas");
if(!output.startsWith("/tmp/")&&!output.startsWith("/private/tmp/"))throw Error("Diagnostic dataset output must be under /tmp");
await mkdir(output,{recursive:true});
const memory=()=>{const mb=process.memoryUsage().rss/1048576;if(mb>4096)throw Error("Hurdle V3 memory safety stop at 4 GiB");return Math.round(mb);};
async function* lines<T>(path:string){for await(const l of createInterface({input:createReadStream(path),crlfDelay:Infinity}))if(l.trim())yield JSON.parse(l) as T;}
async function saveRows(path:string,rows:unknown[]){const s=createWriteStream(path);for(const r of rows)if(!s.write(JSON.stringify(r)+"\n"))await once(s,"drain");s.end();await once(s,"finish");}
type BookRunner={id:string;horse:string;horseId?:string;v2Inputs:number[];v2Contributions:number[];v2Score:number;v2Probability:number;v2Rank:number;winner:boolean|null;outcomeStatus:string|null;or:number|null;age:number|null;weight:number|null};
type Book={id:string;date:string;year:string;course:string;kind:"historical"|"november_diagnostic"|"avatar_diagnostic";source:string;cutoff:string;off:string;runners:BookRunner[]};
type AtlasRace={id:string;date:string;year:string;course:string;source:string;runners:{id:string;horse:string;won:boolean;raw:(number|null)[];contributions:number[];score:number}[]};
const model=JSON.parse(await readFile("data/research/tissue-generation-2026-11-hurdle.json","utf8")) as TissueGenerationModel;
const supplements=JSON.parse(await readFile(atlas+"/supplements.json","utf8")) as {id:string;capture:string}[];
const captures=new Map(supplements.map(r=>[r.id,r.capture]));
const books:Book[]=[];
for await(const r of lines<AtlasRace>(atlas+"/HURDLE.ndjson")){
 if(r.source.startsWith("frozen")&&!captures.has(r.id))throw Error("Missing original frozen historical feature cutoff");
 const ps=raceSoftmax(r.runners.map(p=>p.score)),order=[...ps.keys()].sort((a,b)=>ps[b]-ps[a]||r.runners[a].id.localeCompare(r.runners[b].id));
 books.push({id:r.id,date:r.date,year:r.year,course:r.course,kind:"historical",source:r.source,cutoff:r.source.startsWith("frozen")?captures.get(r.id)??"":"",off:"",runners:r.runners.map((p,i)=>({id:p.id,horse:p.horse,v2Inputs:p.raw.slice(0,model.baseModel.names.length).map((v,j)=>v===null?0:model.baseModel.names[j].startsWith("log_")&&!model.baseModel.names[j].endsWith("_missing")?Math.log1p(v):v),v2Contributions:p.contributions,v2Score:p.score,v2Probability:ps[i],v2Rank:order.indexOf(i)+1,winner:p.won,outcomeStatus:"settled",or:p.raw[0],age:p.raw[10],weight:p.raw[11]}))});
}
const ledger=JSON.parse(await readFile(output+"/v2-forward.json","utf8")) as {races:GenerationRace[]};
const avatarRaceId="0238e109-7d6a-430c-a029-fed71fca4683";
const snapshotBooks=ledger.races.filter(r=>r.family==="HURDLE"&&(r.raceDate==="2026-11-05"||r.raceDate==="2026-11-06"||r.raceId===avatarRaceId));
for(const r of snapshotBooks){
 books.push({id:r.raceId,date:r.raceDate,year:r.raceDate.slice(0,4),course:r.course,kind:r.raceId===avatarRaceId?"avatar_diagnostic":"november_diagnostic",source:"frozen V2; diagnostic reconstruction only",cutoff:r.featureCutoffAt,off:r.scheduledOff,runners:r.runners.map(p=>({id:p.runnerId,horse:p.horseName,horseId:p.horseId,v2Inputs:p.modelInputs,v2Contributions:[...model.baseModel.weights.map((w,i)=>w*(p.modelInputs[i]-model.baseModel.means[i])/model.baseModel.scales[i]),...model.adjustment.weights.map((w,i)=>w*(p.adjustmentInputs[i]-model.adjustment.means[i])/model.adjustment.scales[i])],v2Score:score(model.baseModel,p.modelInputs)+score(model.adjustment,p.adjustmentInputs),v2Probability:p.probability,v2Rank:p.rank,winner:p.outcome?.winner??null,outcomeStatus:p.outcome?.status??null,or:p.modelInputs[18]?null:p.modelInputs[0],age:p.modelInputs[28]?null:p.modelInputs[10],weight:p.modelInputs[29]?null:p.modelInputs[11]}))});
}
const runnerIds=books.flatMap(r=>r.runners.map(p=>p.id));
type Meta={id:string;horse:string;trainer:string|null;jockey:string|null;raceId:string;at:Date;raceName:string|null;raceType:string|null;raceTypeCode:string|null;declared:number|null};
type HistoryRow={id:string;horse:string;race:string;at:Date;raceName:string|null;raceType:string|null;raceTypeCode:string|null;finish:number|null;status:string|null;comment:string|null};
type StarterRow={id:string;trainer:string|null;jockey:string|null;at:Date;finish:number|null;status:string|null};
const databaseUrl=process.env.DATABASE_URL;
if(!databaseUrl)throw Error("DATABASE_URL is required for the read-only Hurdle V3 extraction");
const sql=postgres(databaseUrl,{max:1,connect_timeout:10,connection:{default_transaction_read_only:true,statement_timeout:180000}});
try{
 if((await sql`show transaction_read_only`)[0].transaction_read_only!=="on")throw Error("Database connection is not read-only");
 const meta=await sql<Meta[]>`select rr.id,rr.horse_id as horse,rr.trainer_id as trainer,rr.jockey_id as jockey,rr.race_id as "raceId",r.race_datetime as at,r.race_name as "raceName",r.race_type as "raceType",r.race_type_code as "raceTypeCode",r.declared_runner_count as declared from race_runners rr join races r on r.id=rr.race_id where rr.id in ${sql(runnerIds)} and rr.source='sporting_life' and r.source='sporting_life'`;
 await saveRows(output+"/target-metadata.ndjson",meta);
 const byId=new Map(meta.map(m=>[m.id,m]));
 for(const b of books){for(const r of b.runners){const m=byId.get(r.id);if(!m||m.raceId!==b.id||classifyJumpRaceSubtype(m)!=="hurdle")throw Error("Missing or non-Hurdle target provenance");r.horseId=m.horse;}b.off=new Date(byId.get(b.runners[0].id)!.at).toISOString();b.cutoff ||= b.off;if(b.cutoff>b.off||b.kind==="historical"&&b.date>="2026-11-05")throw Error("Invalid target chronology");}
 const horses=[...new Set(meta.map(m=>m.horse))],trainers=[...new Set(meta.flatMap(m=>m.trainer?[m.trainer]:[]))],jockeys=[...new Set(meta.flatMap(m=>m.jockey?[m.jockey]:[]))];
 const maxCutoff=books.map(b=>b.cutoff).sort().at(-1)!;
 const rawHistory=await sql<HistoryRow[]>`select rr.id,rr.horse_id as horse,rr.race_id as race,r.race_datetime as at,r.race_name as "raceName",r.race_type as "raceType",r.race_type_code as "raceTypeCode",rr.finishing_position as finish,rr.result_status as status,rr.runner_comment as comment from race_runners rr join races r on r.id=rr.race_id where rr.horse_id in ${sql(horses)} and rr.source='sporting_life' and r.source='sporting_life' and r.race_datetime < ${maxCutoff}::timestamptz and lower(concat_ws(' ',r.race_name,r.race_type,r.race_type_code)) like '%hurdle%' order by r.race_datetime,rr.id`;
 await saveRows(output+"/hurdle-source.ndjson",rawHistory);
 console.log(JSON.stringify({stage:"horse history read",targets:meta.length,hurdleRows:rawHistory.length,rssMB:memory()}));
 const history=new Map<string,HurdleV3Prior[]>();
 for(const r of rawHistory){if(classifyJumpRaceSubtype(r)!=="hurdle")throw Error("Non-Hurdle source in Hurdle history");const rows=history.get(r.horse)??[];rows.push({runnerId:r.id,raceId:r.race,family:"HURDLE",at:new Date(r.at).toISOString(),finishingPosition:r.finish,resultStatus:r.status,speed:null,comment:r.comment});history.set(r.horse,rows);}
 const starters=await sql<StarterRow[]>`select rr.id,rr.trainer_id as trainer,rr.jockey_id as jockey,r.race_datetime as at,rr.finishing_position as finish,rr.result_status as status from race_runners rr join races r on r.id=rr.race_id where (rr.trainer_id in ${sql(trainers)} or rr.jockey_id in ${sql(jockeys)}) and rr.source='sporting_life' and r.source='sporting_life' and r.race_datetime < ${maxCutoff}::timestamptz order by r.race_datetime,rr.id`;
 await saveRows(output+"/participant-source.ndjson",starters);
 type Point={at:string;ms:number;starts:number;wins:number};
 const trainerIndex=new Map<string,Point[]>(),jockeyIndex=new Map<string,Point[]>();let excluded=0,nonfinishers=0;
 for(const r of starters){if(!canonicalHurdleV3Starter({finishingPosition:r.finish,resultStatus:r.status})){excluded++;continue;}if(r.finish===null)nonfinishers++;
  for(const [id,index]of [[r.trainer,trainerIndex],[r.jockey,jockeyIndex]] as const){if(!id)continue;const rows=index.get(id)??[],last=rows.at(-1);rows.push({at:new Date(r.at).toISOString(),ms:new Date(r.at).getTime(),starts:(last?.starts??0)+1,wins:(last?.wins??0)+Number(r.finish===1)});index.set(id,rows);}}
 function prior(index:Map<string,Point[]>,id:string|null,at:string):HurdleV3Participant{const rows=id?index.get(id)??[]:[],ms=Date.parse(at);let lo=0,hi=rows.length;while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid].ms<ms)lo=mid+1;else hi=mid;}const p=rows[lo-1];return {starts:p?.starts??0,wins:p?.wins??0,latestAt:p?.at??null};}
 function target(b:Book,r:BookRunner):HurdleV3Target{const m=byId.get(r.id)!;return{runnerId:r.id,raceId:b.id,cutoff:b.cutoff,scheduledOff:b.off,officialRating:r.or,age:r.age,weightLbs:r.weight,trainer:prior(trainerIndex,m.trainer,b.cutoff),jockey:prior(jockeyIndex,m.jockey,b.cutoff)};}
 console.log(JSON.stringify({stage:"participant histories indexed",sourceRows:starters.length,excluded,validNonfinishers:nonfinishers,rssMB:memory()}));
 const speedIds=new Set<string>();
 for(const b of books)for(const r of b.runners)for(const h of hurdleV3PriorHistory(target(b,r),history.get(r.horseId!)??[]).slice(0,3))speedIds.add(h.runnerId);
 const existing=JSON.parse(await readFile(atlas+"/jump-ratings.json","utf8")) as Record<string,number|null>,ratings:Record<string,number|null>={};
 for(const id of speedIds)if(id in existing)ratings[id]=existing[id];
 const pending=[...speedIds].filter(id=>!(id in ratings)),db=drizzle(sql,{schema});
 for(let i=0;i<pending.length;i+=500){const batch=pending.slice(i,i+500),result=await getJumpSpeedRatingsAsOfRuns(db,batch,{source:"sporting_life"});for(const id of batch)ratings[id]=result.get(id)?.rating??null;console.log(JSON.stringify({stage:"Hurdle-only prior speed",completed:Math.min(i+500,pending.length),missing:pending.length,reused:speedIds.size-pending.length,rssMB:memory()}));}
 await writeFile(output+"/hurdle-prior-ratings.json",JSON.stringify(ratings));
 for(const list of history.values())for(const h of list)h.speed=ratings[h.runnerId]??null;
 const stream=createWriteStream(output+"/dataset.ndjson");
 for(const b of books){const built=buildHurdleV3Field(b.runners.map(r=>({target:target(b,r),history:history.get(r.horseId!)??[]})));const out={...b,scheduledTime:b.off.slice(11,16),declaredRunnerCount:byId.get(b.runners[0].id)!.declared,runners:b.runners.map(r=>({...r,...built.find(p=>p.runnerId===r.id)!}))};if(!stream.write(JSON.stringify(out)+"\n"))await once(stream,"drain");}
 stream.end();await once(stream,"finish");
 const hashes:Record<string,string>={};for(const p of [output+"/dataset.ndjson",output+"/target-metadata.ndjson",output+"/hurdle-source.ndjson",output+"/participant-source.ndjson",output+"/hurdle-prior-ratings.json",atlas+"/HURDLE.ndjson",atlas+"/jump-ratings.json","data/research/tissue-generation-2026-11-hurdle.json","src/lib/racing/hurdle-v3-challenger-features.ts"]){hashes[p]=createHash("sha256").update(await readFile(p)).digest("hex");memory();}
 await writeFile(output+"/dataset-manifest.json",JSON.stringify({version:"HURDLE_V3_REBUILD_INPUTS_V1",historicalRaces:books.filter(b=>b.kind==="historical").length,novemberDiagnosticRaces:books.filter(b=>b.kind==="november_diagnostic").length,avatarDiagnosticRaces:books.filter(b=>b.kind==="avatar_diagnostic").length,participants:{sourceRows:starters.length,excluded,validNonfinishers:nonfinishers},speed:{selectedPriorRuns:speedIds.size,reused:speedIds.size-pending.length,recalculated:pending.length,method:"canonical jump_speed_v1 as-of-prior-run; Hurdle sources only"},readOnly:true,publicationTimestampsCertified:false,hashes,rssMB:memory()},null,2));
 console.log(JSON.stringify({stage:"complete",books:books.length,rssMB:memory()}));
}finally{await sql.end({timeout:2});}
