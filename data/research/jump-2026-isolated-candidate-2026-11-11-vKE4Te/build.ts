import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";
import { buildBacktestFeatureCache, cacheDirectory } from "@/lib/racing/backtest-cache";
import { connection, json, save, ROOT, FROM, TO } from "./common";
const prebuild=await json<{prebuildPassed:boolean}>(`${ROOT}/prebuild.json`);assert.equal(prebuild.prebuildPassed,true);
const outputDir=`${ROOT}/cache`;
const directory=cacheDirectory({outputDir,from:FROM,to:TO,family:"jump",source:"sporting_life"});
try {await access(directory);throw new Error("Candidate already exists; refusing rebuild/overwrite");} catch(error) {if((error as NodeJS.ErrnoException).code!=="ENOENT") throw error;}
await mkdir(outputDir,{recursive:false});
const {client}=connection();
try {
 await client.unsafe("begin isolation level repeatable read read only");
 const sql = client;
 try {
  const snapshot=await sql`select current_database() database,current_setting('transaction_read_only') read_only,transaction_timestamp() snapshot_at,pg_current_snapshot()::text snapshot`;
  assert.equal(snapshot[0].read_only,"on");
  await save("build-snapshot.json",snapshot);
  const db=drizzle(sql,{schema});
  const timings: {name:string;elapsedMs:number;rows?:number}[]=[];
  const result=await buildBacktestFeatureCache({db,from:FROM,to:TO,family:"jump",outputDir,batchSize:5000,
    onProgress:message=>console.log(`${new Date().toISOString()} ${message}`),
    onFeatureTiming:(name,elapsedMs,rows)=>{timings.push({name,elapsedMs,rows});console.log(`${name}: ${Math.round(elapsedMs)}ms; ${rows??""} rows`);}});
  assert.equal(result.directory,directory);
  await save("build-result.json",{...result,featureTimings:timings,exploratoryOnly:true,activated:false});
  console.log(JSON.stringify({directory,rows:result.manifest.rowCount,seconds:result.elapsedMs/1000}));
  await client.unsafe("commit");
 } catch(error) { await client.unsafe("rollback"); throw error; }
} finally {await client.end();}
