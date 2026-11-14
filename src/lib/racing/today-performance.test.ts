import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";

test("frozen Today loader adapter preserves disabled calls and callback behavior; reports rating tail only for successful cards", () => {
  const result = spawnSync(process.execPath, ["--eval", `
    import {mock} from 'bun:test';
    let status='ok',optionsSeen,callbacks=0;
    const data={get status(){return status}};
    mock.module('@/lib/racing/todays-racing',()=>({getTodaysRacingData:async(db,date,options)=>{
      optionsSeen=options;
      options?.onTiming?.('today_target_metrics_load',12);
      return data;
    }}));
    const {getTodaysRacingDataWithProfile:load}=await import('@/lib/racing/today-performance');
    const {profileRequest}=await import('@/lib/racing/performance-profile');
    const rows=[];console.info=line=>rows.push(JSON.parse(line));
    process.env.RACING_PROFILE='0';process.env.RESEARCH_PROFILE='0';
    if(await load({},'2026-11-14')!==data||optionsSeen!==undefined)throw Error('disabled call changed');
    process.env.RACING_PROFILE='1';
    await profileRequest('request',async()=>{
      if(await load({},'2026-11-14',{onTiming:()=>callbacks++})!==data)throw Error('result changed');
      status='empty';await load({},'2026-11-14');
    });
    if(callbacks!==1||rows.filter(row=>row.operation==='today.runner_rating_and_grouping_tail').length!==1)throw Error('invalid tail/callback');
    if(rows.find(row=>row.operation==='today.runner_rating_and_grouping_tail').status!=='estimated')throw Error('tail must be labelled estimate');
  `], { cwd: process.cwd(), encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
});
