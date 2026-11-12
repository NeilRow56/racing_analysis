import assert from "node:assert/strict";
import { connection, json, save, ROOT } from "./common";
const prebuild=await json<{databaseFingerprint:unknown[]}>(`${ROOT}/prebuild.json`);
const unresolved=await json<{runnerId:string}[]>(`${ROOT}/unresolved-records.json`);
const {client}=connection();
try {
 await client.begin("isolation level repeatable read read only",async sql=>{
  const rows=await sql`select rr.id runner_id,rr.source_id ride_id,rr.horse_id,h.display_name horse,r.id race_id,r.source_id race_source_id,r.race_date date,c.display_name course,r.race_name,rr.finishing_position,rr.result_status,rr.outcome_code,rr.starting_price_decimal::text sp,r.winning_time,
    (select count(*)::int from source_imports s where s.source=r.source and s.source_id=r.source_id and s.source_type='full-result-next-data') full_results
    from race_runners rr join races r on r.id=rr.race_id join horses h on h.id=rr.horse_id join courses c on c.id=r.course_id where rr.id in ${sql(unresolved.map(r=>r.runnerId))} order by r.source_id,rr.id`;
  assert.equal(rows.length,98);assert.equal(new Set(rows.map(r=>r.race_id)).size,14);
  assert.ok(rows.every(r=>r.date==='2026-10-15'&&r.full_results===0&&r.finishing_position===null&&r.result_status===null&&r.winning_time===null));
  await save("unresolved-current-database.json",rows);
  console.log("Verified all 98 unresolved runner identities and 14 races; all remain genuinely unresolved, not losing outcomes.");
  const fingerprint=await sql`select 'races' relation,count(*)::int n,md5(string_agg(md5(row_to_json(t)::text),'' order by id)) digest from races t
    union all select 'runners',count(*)::int,md5(string_agg(md5(row_to_json(t)::text),'' order by id)) from race_runners t
    union all select 'sources',count(*)::int,md5(string_agg(md5(row_to_json(t)::text),'' order by id)) from source_imports t
    union all select 'rules',count(*)::int,md5(string_agg(md5(row_to_json(t)::text),'' order by id)) from saved_research_rules t`;
  const before=JSON.stringify(prebuild.databaseFingerprint),after=JSON.stringify(fingerprint);
  await save("database-preservation.json",{before:prebuild.databaseFingerprint,after:fingerprint,unchanged:before===after,readOnly:true,checkedAt:new Date().toISOString()});
  assert.equal(after,before,"Database records changed since prebuild; preserve starting evidence and investigate external activity");
  console.log("All database race, runner, source-import and saved-rule/snapshot row digests are unchanged.");
 });
}finally{await client.end();}
