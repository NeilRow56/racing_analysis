import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { connection, save, json, ROOT, OLD, FROM, TO, type Race, type Runner } from "./common";
import { winningTimeCorrections } from "@/lib/racing/winning-time-corrections";
import { isJumpRace } from "@/lib/racing/jump-speed-rating";
import { JUMP_WINNING_TIME_GUARD_VERSION } from "@/lib/racing/jump-winning-time-integrity";
import type { HistoricalPreRaceFeatureRow } from "@/lib/racing/historical-target-metrics";
const hash = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const oldRows = (await readFile(`${OLD}/features.ndjson`,"utf8")).trim().split("\n").map(l=>JSON.parse(l) as HistoricalPreRaceFeatureRow);
const diagnostic = await json<{races:{sourceId:string;sourceFile:string;sourceSha256:string;classification:string}[]}>("data/research/jump-2026-blocker-diagnostic-2026-11-11-VX8rfC/diagnostic.json");
const after = await json<{state:{races:Record<string,unknown>[]; runners:Record<string,unknown>[]}}>("data/research/jump-2026-local-recovery-2026-11-11/after-state.json");
const {client} = connection();
try {
 await client.begin("isolation level repeatable read read only",async sql=>{
  const server=await sql`select current_database() database,current_user role,current_setting('transaction_read_only') read_only,pg_postmaster_start_time() started,inet_server_addr() host,inet_server_port() port,transaction_timestamp() snapshot_at,pg_current_snapshot()::text snapshot`;
  assert.equal(server[0].database,"racing_analysis");assert.equal(server[0].read_only,"on");
  const races=await sql<Race[]>`select r.id,r.source_id,r.race_date as date,r.race_datetime::text as at,r.course_id,c.display_name course,r.race_name name,r.race_type type,r.race_type_code type_code,r.distance_yards distance,r.winning_time,
    (si.payload #>> '{props,pageProps,race,race_summary,race_stage}') stage,coalesce(f.n,0)::int full_count,si.id full_id,md5(si.payload::text) payload_hash,(si.payload #>> '{props,pageProps,race,race_summary,winning_time}') raw_time
    from races r join courses c on c.id=r.course_id left join (select source_id,count(*) n from source_imports where source='sporting_life' and source_type='full-result-next-data' group by source_id) f on f.source_id=r.source_id
    left join lateral (select s.id,s.payload from source_imports s where s.source='sporting_life' and s.source_id=r.source_id and s.source_type='full-result-next-data' order by s.fetched_at desc limit 1) si on true
    where r.source='sporting_life' and r.race_date <= '2026-10-15' order by r.race_datetime,r.id`;
  const targets=races.filter(r=>r.date>=FROM&&r.date<=TO&&isJumpRace({raceName:r.name,raceType:r.type,courseName:r.course}));
  const targetRaceIds=targets.map(r=>r.id);
  const runners=await sql<Runner[]>`select rr.id,rr.source_id,rr.race_id,rr.horse_id,h.display_name horse,rr.trainer_id,rr.jockey_id,rr.finishing_position,rr.result_status,rr.outcome_code,rr.starting_price_decimal::text sp,rr.weight_carried_lbs weight,rr.official_rating,rr.beaten_distance
    from race_runners rr join races r on r.id=rr.race_id join horses h on h.id=rr.horse_id
    where rr.source='sporting_life' and r.source='sporting_life' and r.race_date<='2026-10-15' and rr.horse_id in (select distinct x.horse_id from race_runners x where x.race_id in ${sql(targetRaceIds)}) order by r.race_datetime,rr.id`;
  const byRace=new Map(races.map(r=>[r.id,r])),byRunner=new Map(runners.map(r=>[r.id,r]));
  const missingOld=oldRows.filter(r=>!byRace.get(r.targetRaceId)?.full_count);
  assert.equal(missingOld.length,98);assert.equal(new Set(missingOld.map(r=>r.targetRaceId)).size,14);
  const unresolved=missingOld.map(f=>({runnerId:f.targetRunnerId,horseId:f.horseId,horse:f.horseName,...byRace.get(f.targetRaceId),runner:byRunner.get(f.targetRunnerId)??null}));
  assert.ok(unresolved.every(r=>r.date==='2026-10-15'));
  const recovered=[];
  for(const d of diagnostic.races) {
   const bytes=await readFile(d.sourceFile);assert.equal(hash(bytes),d.sourceSha256);
   if(d.classification!=='A') continue;
   const local=JSON.parse(bytes.toString());
   const found=await sql<{id:string;payload:unknown;fetched_at:string}[]>`select id,payload,fetched_at::text from source_imports where source='sporting_life' and source_id=${d.sourceId} and source_type='full-result-next-data'`;
   assert.equal(found.length,1);
   assert.deepEqual(found[0].payload,local);
   const race=races.find(r=>r.source_id===d.sourceId);assert.ok(race);
   const expectedRace=after.state.races.find(r=>r.source_id===d.sourceId);assert.ok(expectedRace);
   assert.equal(race.winning_time,expectedRace.winning_time);
   const expectedRunners=after.state.runners.filter(r=>r.race_id===race.id);
   for(const old of expectedRunners) { const actual=byRunner.get(String(old.id)); assert.ok(actual); for(const field of ['finishing_position','result_status','outcome_code','beaten_distance','official_rating'] as const) assert.equal(actual[field],old[field],`${d.sourceId}/${old.id}/${field}`); }
   recovered.push({sourceId:d.sourceId,raceId:race.id,runnerRecords:expectedRunners.length,fullResultId:found[0].id,file:d.sourceFile,sha256:d.sourceSha256,winningTime:race.winning_time,stage:race.stage,sourcePayloadExact:true});
  }
  assert.equal(recovered.length,11);assert.equal(recovered.reduce((s,r)=>s+r.runnerRecords,0),111);
  const corrections=winningTimeCorrections.map(c=>{const r=races.find(r=>r.source_id===c.sourceId);assert.ok(r);assert.equal(r.date,c.raceDate);assert.equal(r.winning_time,c.corrected);return {...c,databaseTime:r.winning_time,rawSourceTime:r.raw_time,matches:true};});
  const targetRunners=runners.filter(r=>targetRaceIds.includes(r.race_id));
  const targetHorses=new Set(targetRunners.map(r=>r.horse_id));
  const maxTargetTime=Math.max(...targets.map(r=>Date.parse(r.at)));
  const priors=runners.filter(r=>targetHorses.has(r.horse_id)&&Date.parse(byRace.get(r.race_id)!.at)<maxTargetTime);
  const untimed=priors.filter(r=>!byRace.get(r.race_id)!.winning_time?.trim());
  const timedMissingSource=priors.filter(r=>byRace.get(r.race_id)!.winning_time?.trim()&&!byRace.get(r.race_id)!.full_count);
  const missingTargetSource=targetRunners.filter(r=>!byRace.get(r.race_id)!.full_count);
  assert.equal(timedMissingSource.length,0);assert.equal(missingTargetSource.length,0);
  assert.equal(JUMP_WINNING_TIME_GUARD_VERSION,'jump_winning_time_guard_v2_missing_minute');
  const fingerprint=await sql`select 'races' relation,count(*)::int n,md5(string_agg(md5(row_to_json(t)::text),'' order by id)) digest from races t
    union all select 'runners',count(*)::int,md5(string_agg(md5(row_to_json(t)::text),'' order by id)) from race_runners t
    union all select 'sources',count(*)::int,md5(string_agg(md5(row_to_json(t)::text),'' order by id)) from source_imports t
    union all select 'rules',count(*)::int,md5(string_agg(md5(row_to_json(t)::text),'' order by id)) from saved_research_rules t`;
  await save('database-races.json',races);await save('database-runners.json',runners);await save('unresolved-records.json',unresolved);
  await save('prebuild.json',{server,scope:{from:FROM,to:TO,inclusiveRacingDates:true,actualFirstTarget:targets[0]?.at,actualLastTarget:targets.at(-1)?.at},recovered,corrections,original:{rows:oldRows.length,races:new Set(oldRows.map(r=>r.targetRaceId)).size},
    candidateTargetEstimate:{races:targets.length,runners:targetRunners.length},remainingMissingFullResult:{rows:missingOld.length,races:new Set(missingOld.map(r=>r.targetRaceId)).size},timedMissingSource,missingTargetSource,
    untimedPriorRecords:untimed.map(r=>({...r,race:byRace.get(r.race_id)})),databaseFingerprint:fingerprint,guardVersion:JUMP_WINNING_TIME_GUARD_VERSION,prebuildPassed:true});
  console.log(JSON.stringify({scope:[FROM,TO],targets:targetRunners.length,races:targets.length,recovered:recovered.length,unresolved:missingOld.length,untimedPriorRows:untimed.length,artifact:ROOT}));
 });
} finally {await client.end();}
