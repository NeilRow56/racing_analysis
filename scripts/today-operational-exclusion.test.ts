import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("actual Today page renders stored data under an active lock, with every mutation mocked", async () => {
  const home = await mkdtemp(join(tmpdir(), "racing-today-locked-"));
  try {
    const root = join(home, "Library/Logs/RacingAnalysis"); await mkdir(root, { recursive: true });
    await writeFile(join(root, "workflow.lock"), JSON.stringify({ pid: process.pid, token: "busy-fixture" }));
    const code = `
      import {mock} from 'bun:test';
      import {renderToStaticMarkup} from 'react-dom/server';
      let mutations=0, reads=0, ended=0, revalidations=0;
      const forbidden=async()=>{mutations++;throw Error('operational mutation must not run')};
      const connection={db:{execute:async()=>[]},client:{end:async()=>{ended++}}};
      mock.module('@/db',()=>({createDbConnection:()=>connection}));
      const racing=await import('@/lib/racing/todays-racing');
      mock.module('@/lib/racing/todays-racing',()=>({...racing,getTodaysRacingData:async()=>{reads++;return {status:'ok',raceDate:'2026-11-14',displayDate:'Stored racecards fixture',refreshedAt:null,meetings:[]}}}));
      const rules=await import('@/lib/racing/saved-research-rules');
      mock.module('@/lib/racing/saved-research-rules',()=>({...rules,listSavedResearchRulesWithDb:async()=>[]}));
      const tracker=await import('./scripts/diagnose-tpr-vs-timewise-forward');
      mock.module('./scripts/diagnose-tpr-vs-timewise-forward',()=>({...tracker,loadTrackerData:async()=>({races:[]})}));
      const value=await import('@/lib/racing/tissue-value-readers');
      mock.module('@/lib/racing/tissue-value-readers',()=>({...value,loadAllTissueValue:async()=>[]}));
      const generation=await import('@/lib/racing/tissue-generation-forward');
      mock.module('@/lib/racing/tissue-generation-forward',()=>({...generation,loadTissueGeneration:async()=>({races:[]})}));
      const swaps=[
        ['@/lib/racing/tissue-generation-sync',['syncTissueGeneration']],
        ['@/lib/racing/today-result-refresh',['refreshEligibleTodaySelectionResults']],
        ['@/lib/racing/aw-tissue-sync',['syncAwTissueMeetings']],
        ['@/lib/racing/jump-tissue-sync',['syncJumpTissueMeetings']],
        ['@/lib/racing/aw-forward-comparisons',['syncAwForwardComparisons']],
        ['@/lib/racing/tpr-timewise-forward-settlement',['enrichTodayForwardTrackerResults']],
        ['@/lib/racing/turf-performance-rating-snapshots',['saveTurfPerformanceRatingSnapshots','saveTurfPerformanceRatingShadowSnapshots']]
      ];
      for(const [name,keys] of swaps){const original=await import(name);mock.module(name,()=>({...original,...Object.fromEntries(keys.map(key=>[key,forbidden]))}));}
      mock.module('next/cache',()=>({revalidatePath:()=>{revalidations++}}));
      const {default:Page}=await import('./src/app/racing/today/page');
      const {withReadOnlyDiagnostic}=await import('@/lib/racing/performance-profile');
      const render=()=>Page({searchParams:Promise.resolve({date:'2026-11-14'})});
      const html=renderToStaticMarkup(await (process.env.TEST_READ_ONLY_DIAGNOSTIC==='1'?withReadOnlyDiagnostic(render):render()));
      if(!html.includes('Stored racecards fixture')||!html.includes('refresh deferred')||mutations!==0||reads!==1||ended!==1)throw Error(JSON.stringify({html,mutations,reads,ended}));
      const {refreshTodaySelectionResultsAction,saveTimewiseComparisonAction}=await import('./src/app/racing/today/actions');
      await refreshTodaySelectionResultsAction(new FormData());
      if(mutations!==0||reads!==1||revalidations!==1)throw Error('busy action started work');
      const deferred=await saveTimewiseComparisonAction({},new FormData());
      if(deferred.status!=='busy'||!deferred.message.includes('deferred'))throw Error('Timewise save did not defer');
      console.log('STORED_TODAY_RENDERED_WITHOUT_MUTATIONS');
    `;
    for (const mode of ["disabled", "enabled", "diagnostic"]) {
      if (mode === "diagnostic") await rm(join(root, "workflow.lock"));
      // Action checks require a busy lock; the diagnostic page itself must never create one.
      const evaluated = mode === "diagnostic" ? code.replace("const {refreshTodaySelectionResultsAction,saveTimewiseComparisonAction}", "const {existsSync}=await import('node:fs'); if(existsSync(" + JSON.stringify(join(root, "workflow.lock")) + "))throw Error('diagnostic acquired lock'); process.exit(0); const {refreshTodaySelectionResultsAction,saveTimewiseComparisonAction}") : code;
      const result = spawnSync(process.execPath, ["--eval", evaluated], { cwd: process.cwd(), env: { ...process.env, HOME: home, RACING_PROFILE: mode === "disabled" ? "0" : "1", RESEARCH_PROFILE: "0", TEST_READ_ONLY_DIAGNOSTIC: mode === "diagnostic" ? "1" : "0" }, encoding: "utf8", timeout: 20000 });
      assert.equal(result.status, 0, mode + ": " + result.stderr + result.stdout);
      if (mode !== "diagnostic") assert.match(result.stdout, /STORED_TODAY_RENDERED_WITHOUT_MUTATIONS/);
      const rows = result.stdout.split("\n").filter(line => line.startsWith('{"type":"racing_profile"')).map(line => JSON.parse(line));
      if (mode === "disabled") assert.equal(rows.length, 0);
      else {
        assert.ok(rows.length > 0);
        assert.equal(new Set(rows.map(row => row.requestId)).size, 1);
        if (mode === "diagnostic") assert.ok(rows.every(row => !row.operation.startsWith("shared_lock")));
      }
    }
  } finally { await rm(home, { recursive: true, force: true }); }
});
