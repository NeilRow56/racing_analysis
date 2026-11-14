import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";

test("Today diagnostic uses read-only repeatable reads, counts exact queries and saves matching loader/page snapshots", async () => {
  const code = `
    import {mock} from 'bun:test';
    import {isReadOnlyDiagnostic} from './src/lib/racing/performance-profile';
    let logger,ended=0,reads=0,plans=0;
    const client={unsafe:async(query,params)=>{
      if(!query.startsWith('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) select '))throw Error('non-select plan');
      plans++;
      return [{'QUERY PLAN':[{Plan:{'Node Type':'Result','Actual Rows':1,'Filter':'private predicate'},'Planning Time':1,'Execution Time':2}]}];
    },end:async()=>{ended++}};
    mock.module('postgres',()=>({default:url=>{
      if(new URL(url).searchParams.get('options')!=='-c default_transaction_read_only=on')throw Error('unsafe connection');
      return client;
    }}));
    mock.module('drizzle-orm/postgres-js',()=>({drizzle:(client,options)=>{
      logger=options.logger;
      return {transaction:async(work,config)=>{
        if(!isReadOnlyDiagnostic()||config.isolationLevel!=='repeatable read'||config.accessMode!=='read only')throw Error('unsafe transaction');
        return work({fixtureTransaction:true});
      }};
    }}));
    mock.module('./src/lib/racing/todays-racing',()=>({getLocalRacingDate:()=> '2026-11-14',getTodaysRacingData:async(db,date,options)=>{
      if(!db.fixtureTransaction||!isReadOnlyDiagnostic())throw Error('transaction/scope bypass');
      reads++;
      logger.logQuery('select fixture where id = $1',[1]);
      logger.logQuery('select fixture where id = $1',[1]);
      options.onTiming('today_target_metrics_load',12);
      return {status:'ok',date,meetings:[],updatedAt:new Date('2026-11-14T10:00:00Z')};
    }}));
    const React=await import('react');
    mock.module('./src/app/racing/today/page',()=>({default:async()=>{
      if(!isReadOnlyDiagnostic()||new URL(process.env.DATABASE_URL).searchParams.get('options')!=='-c default_transaction_read_only=on')throw Error('unsafe page');
      return React.createElement('p',null,'Frozen fixture');
    }}));
    process.env.DATABASE_URL='postgres://fixture:secret@example.invalid/fixture?options=unsafe';
    process.argv=['bun','scripts/diagnose-today-performance.ts','--explain','--page'];
    await import('./scripts/diagnose-today-performance');
    if(reads!==2||ended!==1||plans!==1||isReadOnlyDiagnostic())throw Error('incorrect lifecycle');
  `;
  const result = spawnSync(process.execPath, ["--eval", code], { cwd: process.cwd(), encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes("secret"));
  const directory = result.stdout.match(/Read-only loader diagnostics saved to (.+)/)?.[1];
  assert.ok(directory);
  try {
    const summary = JSON.parse(await readFile(`${directory}/first-summary.json`, "utf8"));
    assert.equal(summary.queries, 2);
    assert.equal(summary.uniqueQueries, 1);
    assert.equal(summary.repeatedQueries[0].count, 2);
    assert.equal(await readFile(`${directory}/first.json`, "utf8"), await readFile(`${directory}/repeat.json`, "utf8"));
    assert.equal(await readFile(`${directory}/first-page.html`, "utf8"), await readFile(`${directory}/repeat-page.html`, "utf8"));
    const plans = await readFile(`${directory}/plans.json`, "utf8");
    assert.ok(!plans.includes("private predicate"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
