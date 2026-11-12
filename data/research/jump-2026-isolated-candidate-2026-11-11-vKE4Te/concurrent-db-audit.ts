import assert from "node:assert/strict";
import { connection, json, save, ROOT } from "./common";
const prebuild=await json<{server:{snapshot_at:string}[]}>(`${ROOT}/prebuild.json`);
const since=prebuild.server[0].snapshot_at;
const {client}=connection();
try {
 await client.begin("isolation level repeatable read read only",async sql=>{
  const changedRaces=await sql`select id,source_id,race_date,winning_time,updated_at::text from races where updated_at>${since}::timestamptz order by updated_at`;
  const changedRunners=await sql`select rr.id,rr.race_id,r.source_id race_source_id,r.race_date,rr.finishing_position,rr.result_status,rr.updated_at::text from race_runners rr join races r on r.id=rr.race_id where rr.updated_at>${since}::timestamptz order by rr.updated_at,rr.id`;
  const changedImports=await sql`select id,source_id,source_type,created_at::text,updated_at::text,payload #>> '{props,pageProps,race,race_summary,date}' source_date,payload #>> '{props,pageProps,race,race_summary,race_stage}' stage from source_imports where updated_at>${since}::timestamptz or created_at>${since}::timestamptz order by updated_at`;
  const historicalRaceChanges=changedRaces.filter(r=>r.race_date<='2026-10-15');
  const historicalRunnerChanges=changedRunners.filter(r=>r.race_date<='2026-10-15');
  const historicalImportChanges=await sql`select s.id,s.source_id,s.source_type,r.race_date from source_imports s join races r on r.source=s.source and r.source_id=s.source_id where r.race_date<='2026-10-15' and (s.updated_at>${since}::timestamptz or s.created_at>${since}::timestamptz)`;
  await save("concurrent-database-activity.json",{baselineSnapshot:since,readOnlyAudit:true,taskConnectionsReadOnly:true,changedRaces,changedRunners,changedImports,historicalRaceChanges,historicalRunnerChanges,historicalImportChanges,
    explanation:"Whole-table digest preservation failed and remains recorded. Timestamp/identity checks distinguish later external activity from candidate input history; they do not overwrite the baseline or identify the external process."});
  assert.equal(historicalRaceChanges.length,0);assert.equal(historicalRunnerChanges.length,0);assert.equal(historicalImportChanges.length,0);
  console.log(JSON.stringify({changedRaces:changedRaces.length,changedRunners:changedRunners.length,changedImports:changedImports.length,historicalChanges:0}));
 });
}finally{await client.end();}
