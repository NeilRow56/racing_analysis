import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderToStaticMarkup } from "react-dom/server";
import { HurdleRecencyResearchSection } from "@/app/racing/research/forward-value/hurdle-recency-research";
import { appendHurdleRecency, buildHurdleRecencyObservations, completionStatus, emptyHurdleRecency, HURDLE_RECENCY_EPOCH,
  hurdleRecencySampleStatus, loadHurdleRecency, mutateHurdleRecency, pendingHurdleRecencyRaceIds, recentCompletionFeatures,
  runHurdleRecencyCycle, settleHurdleRecency, summarizeHurdleRecency, type HurdlePriorRun, type HurdleRecencyData } from "./hurdle-recency-forward";
import { calculateHorseMetricsAsOf } from "./horse-metrics";
import { currentDayProspectiveCapture } from "./current-day-sync";
import { workflowSteps } from "../../../scripts/run-research-workflow";
import type { TodayMeeting, TodayRace, TodayRunner } from "./todays-racing";

const date = "2026-10-17";
const now = new Date(`${date}T08:00:00Z`);
const after = new Date(`${date}T16:00:00Z`);
function prior(id: string, status: string | null = "finished", position: number | null = 4, time = "2026-10-05T14:00:00Z"): HurdlePriorRun {
  return { runnerId: id, horseId: "horse-a", raceId: `prior-${id}`, raceDateTime: new Date(time), resultStatus: status, finishingPosition: position };
}
function runner(id: string, price: number): TodayRunner {
  return { runnerId: id, runnerSourceId: id, horseId: `horse-${id}`, horseName: `Horse ${id}`, saddleclothNumber: 1,
    horseAge: 6, horseSex: null, weight: null, weightCarriedLbs: null, draw: null, jockeyName: null,
    trainerId: null, trainerName: null, officialRating: null, odds: "1/100", oddsDecimal: "1.01",
    forecastOdds: "1/100", forecastDecimalOdds: 1.01,
    bookmakerQuotes: [{ bookmakerId: 1, bookmakerName: "Bookmaker", fractionalOdds: null, decimalOdds: price }],
    resultStatus: null, finishingPosition: null,
    metrics: { ...calculateHorseMetricsAsOf({ runs: [], beforeDateTime: new Date(`${date}T14:00:00Z`) }), daysSinceLastRun: 11, latestRunDate: "2026-10-05" } };
}
function race(): TodayRace {
  return { raceId: "race", sourceId: "sl", scheduledTime: "14:00", raceDateTime: new Date(`${date}T14:00:00Z`), courseCountry: "GB",
    raceName: "Novices Handicap Hurdle", raceClass: "4", raceType: "hurdle", raceTypeCode: null, distance: "2m", distanceYards: 3520,
    going: null, surface: null, declaredRunnerCount: 6, actualRunnerCount: 6, winningTime: null,
    runners: [runner("a", 2), runner("b", 4), runner("c", 4), runner("d", 8), runner("e", 12), runner("f", 20)] };
}
function meetings(r: TodayRace): TodayMeeting[] {
  return [{ courseId: "course", courseSourceId: "sl-course", courseName: "Test Course", country: "GB", order: 1, races: [r] }];
}
function history(r = race()) {
  return new Map(r.runners.map((runner) => [runner.horseId, [prior("completed", "finished", 3, "2026-09-29T14:00:00Z"), prior("pu", "pulled_up", null)].map((h) => ({ ...h, horseId: runner.horseId }))]));
}
function observations(r = race(), capturedAt = now) {
  return buildHurdleRecencyObservations({ meetings: meetings(r), raceDate: date, historyByHorse: history(r), capturedAt });
}
function captured(r = race()) { return appendHurdleRecency(emptyHurdleRecency(), observations(r)); }
test("loaded Hurdle declarations capture every runner with no actual starter count", () => {
  const r = race();
  r.actualRunnerCount = null;
  const rows = observations(r);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map(row => row.runnerId), r.runners.map(runner => runner.runnerId));
  const data = appendHurdleRecency(emptyHurdleRecency(), rows);
  assert.equal(appendHurdleRecency(data, observations(r)), data);
  r.runners[0]!.resultStatus = "non_runner";
  for (const count of [5, 6]) {
    r.declaredRunnerCount = count;
    assert.equal(observations(r).length, 5);
  }
  r.declaredRunnerCount = 7;
  assert.deepEqual(observations(r), []);
  r.declaredRunnerCount = null;
  assert.deepEqual(observations(r), []);
});
function result(r = race()): TodayRace {
  return { ...r, winningTime: "4m 2s", runners: r.runners.map((runner, i) => ({ ...runner, resultStatus: "finished", finishingPosition: i + 1, oddsDecimal: null })) };
}
const settle = (data: HurdleRecencyData, r = result()) => settleHurdleRecency(data, new Map([[r.raceId, r]]), after);

test("first valid capture uses genuine bookmaker median, full-field normalized probability, tied competition rank and stored history", () => {
  const r = race();
  r.runners[0]!.bookmakerQuotes!.push({ bookmakerId: 2, bookmakerName: "Second", fractionalOdds: null, decimalOdds: 3 });
  const data = captured(r), [a,b,c] = data.observations;
  assert.equal(data.observations.length, 6);
  assert.equal(a!.market.medianBookmakerDecimal, 2.5);
  assert.equal(a!.market.quotes.length, 2);
  assert.equal(a!.firstCapturedAt, now.toISOString());
  assert.equal(a!.market.capturedAt, now.toISOString());
  assert.ok(Math.abs(data.observations.reduce((s,r) => s+r.market.normalizedProbability,0)-1)<1e-12);
  assert.equal(a!.market.marketRank, 1); assert.equal(b!.market.marketRank, 2); assert.equal(c!.market.marketRank, 2);
  assert.equal(data.observations[3]!.market.marketRank, 4);
  assert.equal(a!.features.usableRecentRuns, 1); assert.equal(a!.features.recentCompletedRuns, 1);
  assert.equal(a!.features.recentRunCount, 2); assert.equal(a!.features.recentNonCompletionCount, 1);
  assert.equal(a!.features.daysSinceLastRun, 11); assert.equal(a!.flags.LATEST_RUN_PU, true);
});

test("repeated capture never overwrites first price, rank, features or timestamp and deduplicates within one batch", () => {
  const data = captured(); const before = JSON.stringify(data);
  const r = race();r.runners[0]!.bookmakerQuotes![0]!.decimalOdds=30;r.runners[0]!.metrics!.daysSinceLastRun=300;
  const candidates = observations(r, new Date(`${date}T09:00:00Z`));
  assert.strictEqual(appendHurdleRecency(data, [...candidates,...candidates]),data);
  assert.equal(JSON.stringify(data), before);
  assert.equal(appendHurdleRecency(emptyHurdleRecency(), [...candidates,...candidates]).observations.length,6);
});

test("only Hurdles qualify, including all odds/ranks and missing ratings/class", () => {
  for (const type of ["chase","NH flat","flat"]) {
    const r = race();r.raceType=type;r.raceName=type;
    assert.equal(observations(r).length,0);
  }
  const r=race();r.raceClass=null;r.runners[5]!.bookmakerQuotes![0]!.decimalOdds=501;
  assert.equal(observations(r).length,6);
});

test("capture refuses partial priced fields and never falls back to forecast or SP", () => {
  const r=race();r.runners[1]!.bookmakerQuotes=[];
  assert.equal(observations(r).length,0);
  r.runners[1]!.bookmakerQuotes=[{bookmakerId:1,bookmakerName:"Bad",fractionalOdds:null,decimalOdds:NaN}];
  assert.equal(observations(r).length,0);
});

test("full field prices still normalize correctly when one runner's history is unavailable", () => {
  const r=race(), h=history(r);h.delete("horse-a");
  const rows=buildHurdleRecencyObservations({meetings:meetings(r),raceDate:date,historyByHorse:h,capturedAt:now});
  assert.equal(rows.length,5);assert.equal(rows[0]!.market.marketRank,2);assert.equal(rows[0]!.market.fieldPrices.length,6);
  assert.equal(rows[0]!.market.normalizedProbability, observations(r)[1]!.market.normalizedProbability);
});

test("cannot capture past races, future dates, pre-epoch, already-started/result-bearing races or incomplete fields", () => {
  assert.equal(observations(race(),after).length,0);
  assert.equal(observations(race(),new Date("2026-10-18T08:00:00Z")).length,0);
  const early=new Date(new Date(HURDLE_RECENCY_EPOCH).getTime()-1);
  assert.equal(observations(race(),early).length,0);
  const r=race();r.runners[0]!.resultStatus="pulled_up";assert.equal(observations(r).length,0);
  r.runners[0]!.resultStatus=null;r.actualRunnerCount=10;assert.equal(observations(r).length,0);
});

test("last-three proxy excludes target/future/void starts, preserves sparse history, and needs no ratings", () => {
  const runs=[prior("old","finished",2,"2026-08-01T14:00:00Z"),prior("f","fell",null,"2026-09-01T14:00:00Z"),
    prior("pu","pulled_up",null),prior("ok","finished",5,"2026-10-06T14:00:00Z"),prior("nr","non_runner",null,"2026-10-07T14:00:00Z"),
    prior("future","finished",1,"2026-10-17T12:00:00Z"),{...prior("target"),raceId:"race"}];
  const f=recentCompletionFeatures({history:runs,raceId:"race",horseId:"horse-a",targetTime:race().raceDateTime!,capturedAt:now,daysSinceLastRun:10,latestRunDate:"2026-10-06"});
  assert.deepEqual(f.features.recentRuns.map(r=>r.runnerId),["f","pu","ok"]);
  assert.equal(f.features.usableRecentRuns,1);assert.equal(f.features.recentNonCompletionCount,2);
  assert.equal(f.features.anyRecentF,true);assert.equal(f.features.anyRecentPU,true);
  assert.equal(f.flags.RECENT_COMPLETER,true);assert.equal(f.flags.RECENT_NON_COMPLETER,false);
  assert.equal(f.flags.LATEST_RUN_PU,false);assert.equal(f.flags.ANY_RECENT_PU,true);
});

test("PU flags and latest non-completer flag do not impose a new lookback window", () => {
  const r=captured().observations[0]!;
  assert.equal(r.flags.RECENT_NON_COMPLETER,true);assert.equal(r.flags.RECENT_COMPLETER,false);assert.equal(r.flags.ANY_RECENT_PU,true);
  const f=recentCompletionFeatures({history:[prior("pu","pulled_up",null)],raceId:"race",horseId:"horse-a",targetTime:race().raceDateTime!,capturedAt:now,daysSinceLastRun:120,latestRunDate:"2026-06-18"});
  assert.equal(f.flags.RECENT_NON_COMPLETER,false);assert.equal(f.flags.LATEST_RUN_PU,true);assert.equal(f.flags.ANY_RECENT_PU,true);
  assert.equal(f.flags.NO_RECENT_COMPLETION,true);
});

test("30-day recent boundary is fixed and missing history is distinct from non-completion", () => {
  const make=(days:number|null,runs= [prior("ok")])=>recentCompletionFeatures({history:runs,raceId:"race",horseId:"horse-a",targetTime:race().raceDateTime!,capturedAt:now,daysSinceLastRun:days,latestRunDate:null});
  assert.equal(make(30).flags.RECENT_COMPLETER,true);assert.equal(make(31).flags.RECENT_COMPLETER,false);
  const f=make(null,[]);assert.equal(f.features.latestRunCompleted,null);assert.equal(f.features.latestCompletionStatus,"no_history");
  assert.equal(f.features.recentNonCompletionCount,0);assert.equal(f.flags.NO_RECENT_COMPLETION,true);assert.equal(f.flags.RECENT_NON_COMPLETER,false);
});

test("canonical PU/F/UR/BD and other statuses retain separate categories", () => {
  for (const [raw,expected] of [["pulled_up","pulled_up"],["fell","fell"],["unseated_rider","unseated"],["unseated","unseated"],["brought_down","brought_down"],["refused","other_noncompletion"]]) {
    assert.equal(completionStatus(prior("x",raw!,null)),expected);
  }
  const f=recentCompletionFeatures({history:[prior("ur","unseated_rider",null,"2026-10-01T12:00:00Z"),prior("bd","brought_down",null,"2026-10-02T12:00:00Z"),prior("other","refused",null)],raceId:"race",horseId:"horse-a",targetTime:race().raceDateTime!,capturedAt:now,daysSinceLastRun:12,latestRunDate:null});
  assert.equal(f.features.anyRecentUR,true);assert.equal(f.features.anyRecentBD,true);assert.equal(f.features.anyRecentOtherNonCompletion,true);assert.equal(f.features.recentNonCompletionCount,3);
});

test("settlement populates finish metrics, preserves the market snapshot, and uses positive rank improvement for outperformance", () => {
  const data=captured(),before=JSON.stringify(data.observations[0]!.market),r=result();
  r.runners[0]!.finishingPosition=6;r.runners[5]!.finishingPosition=1;
  const settled=settle(data,r);
  assert.equal(settled.observations[0]!.outcome!.rankImprovement,-5);
  const last=settled.observations[5]!.outcome!;assert.equal(last.rankImprovement,5);assert.equal(last.normalizedFinish,0);assert.equal(last.winner,true);
  assert.equal(last.top3,true);assert.equal(last.topHalf,true);assert.equal(JSON.stringify(settled.observations[0]!.market),before);
  assert.strictEqual(settle(settled,r),settled);
});

test("settlement does not need a starting price for non-betting finishing metrics", () => {
  const s=settle(captured());assert.equal(s.observations.filter(r=>r.outcome?.status==="settled").length,6);
  assert.deepEqual(pendingHurdleRecencyRaceIds(s),[]);
});

test("NR and abandoned/void observations settle without a winner and never become losses", () => {
  for (const status of ["non_runner","void","void_race","abandoned","cancelled"]) {
    const r=race();r.runners=r.runners.map(r=>({...r,resultStatus:status}));
    const s=settle(captured(),r);
    assert.ok(s.observations.every(r=>r.outcome?.status===(status==="non_runner"?"NR":"void")));
    assert.ok(s.observations.every(r=>r.outcome?.winner===null&&r.outcome.rankImprovement===null));
    const summary=summarizeHurdleRecency(s);assert.equal(summary.overall.settled,0);assert.equal(summary.overall.marketExpectedWinners,0);assert.equal(summary.overall.actualOverExpected,null);
  }
});

test("started non-finishers tie at bottom, get normalized finish 1, retain category and false top rates", () => {
  for(const status of ["pulled_up","fell","unseated_rider","brought_down","refused"]) {
    const r=result();r.runners[5]!.finishingPosition=null;r.runners[5]!.resultStatus=status;
    const out=settle(captured(),r).observations[5]!.outcome!;
    assert.equal(out.finishPosition,null);assert.equal(out.finishRank,6);assert.equal(out.normalizedFinish,1);
    assert.equal(out.top3,false);assert.equal(out.topHalf,false);assert.equal(out.winner,false);assert.equal(out.rankImprovement,0);
    assert.equal(out.nonFinisherCategory,completionStatus(prior("x",status,null)));
  }
});

test("NR reduces settled field size without altering first-capture ranks/probabilities", () => {
  const r=result();r.runners[0]!.finishingPosition=null;r.runners[0]!.resultStatus="non_runner";
  r.runners.slice(1).forEach((r,i)=>r.finishingPosition=i+1);r.actualRunnerCount=5;
  const data=captured(),s=settle(data,r);assert.equal(s.observations[0]!.outcome!.status,"NR");
  assert.equal(s.observations[5]!.market.marketRank,6);assert.equal(s.observations[5]!.outcome!.finishRank,5);
  assert.equal(s.observations[5]!.outcome!.rankImprovement,1);assert.equal(s.observations[5]!.outcome!.normalizedFinish,1);
  assert.equal(summarizeHurdleRecency(s).overall.top3Eligible,0);
  assert.equal(s.observations[1]!.outcome!.top3,true);
});

test("incomplete, unresolved and invalid finishing results remain pending", () => {
  const data=captured();
  const missing=result();missing.runners.pop();assert.strictEqual(settle(data,missing),data);
  const unresolved=result();unresolved.runners[2]!.finishingPosition=null;unresolved.runners[2]!.resultStatus=null;assert.strictEqual(settle(data,unresolved),data);
  const bad=result();bad.runners[3]!.finishingPosition=20;assert.strictEqual(settle(data,bad),data);
  assert.strictEqual(settleHurdleRecency(data,new Map([["race",result()]]),now),data);
});

test("dead heat winner credit uses canonical divisor for A/E while preserving winner booleans", () => {
  const r=result();r.runners[1]!.finishingPosition=1;
  const s=settle(captured(),r),summary=summarizeHurdleRecency(s).overall;
  assert.equal(s.observations[0]!.outcome!.winnerCredit,0.5);assert.equal(s.observations[1]!.outcome!.winnerCredit,0.5);
  assert.equal(summary.winners,2);assert.equal(summary.actualWinnerCredit,1);assert.ok(Math.abs(summary.actualOverExpected!-1)<1e-12);
});

test("sample status boundaries use settled observations only", () => {
  for(const [n,label] of [[0,"TOO EARLY"],[49,"TOO EARLY"],[50,"EARLY"],[149,"EARLY"],[150,"DEVELOPING"],[299,"DEVELOPING"],[300,"MEANINGFUL PROSPECTIVE SAMPLE"]] as const)assert.equal(hurdleRecencySampleStatus(n),label);
});

test("summary groups, expected winners and fixed probability/rank bands use only settled outcomes", () => {
  const data=captured();data.observations[0]!.flags.RECENT_COMPLETER=true;data.observations[0]!.flags.RECENT_NON_COMPLETER=false;data.observations[0]!.flags.LATEST_RUN_PU=false;
  const s=settle(data),summary=summarizeHurdleRecency(s);
  assert.equal(summary.groups.find(g=>g.group==="RECENT_COMPLETER")!.settled,1);
  assert.equal(summary.groups.find(g=>g.group==="RECENT_NON_COMPLETER")!.settled,5);
  assert.equal(summary.groups.find(g=>g.group==="NOT_LATEST_RUN_PU")!.settled,1);
  assert.equal(summary.groups.find(g=>g.group==="ANY_RECENT_PU")!.settled,6);
  assert.equal(summary.groups.find(g=>g.group==="NO_RECENT_PU")!.settled,0);
  assert.equal(summary.overall.meanFinishRank,3.5);assert.equal(summary.overall.top3Rate,0.5);assert.equal(summary.overall.topHalfRate,0.5);
  assert.ok(Math.abs(summary.overall.marketExpectedWinners-1)<1e-12);
  assert.equal(summarizeHurdleRecency(data).overall.actualOverExpected,null);
  assert.equal(summary.probabilityBands.length,6);assert.equal(summary.rankBands.length,5);
});

test("results never calls capture; summary/today are read-only commands, live/after only invoke results", async () => {
  let fetched:string[]=[];
  const data=await runHurdleRecencyCycle({command:"results",raceDate:date,data:captured(),
    loadCapture:async()=>{throw new Error("must not read cards");},loadResults:async(ids)=>{fetched=ids;return new Map([["race",result()]]);},now:()=>after});
  assert.deepEqual(fetched,["race"]);assert.equal(data.observations.length,6);assert.equal(data.observations[0]!.outcome!.status,"settled");
  const empty=await runHurdleRecencyCycle({command:"results",raceDate:date,data:emptyHurdleRecency(),loadCapture:async()=>{throw Error("no capture");},loadResults:async()=>{throw Error("no pending results");}});
  assert.equal(empty.observations.length,0);
  for(const mode of ["live","after"] as const){const steps=workflowSteps(mode,date).filter(s=>s.script.startsWith("hurdle-recency:"));assert.deepEqual(steps.map(s=>s.script),["hurdle-recency:results"]);}
  assert.equal(workflowSteps("morning",date).filter(s=>s.script==="hurdle-recency:sync").length,1);
  for(const mode of ["night","late"] as const)assert.equal(workflowSteps(mode,date).some(s=>s.script.startsWith("hurdle-recency:")),false);
});

test("sync only reads today's cards, and a load crossing the off cannot create retrospective captures", async () => {
  const noLoad=async()=>{throw Error("no historical cards");};
  const past=await runHurdleRecencyCycle({command:"sync",raceDate:"2026-10-16",data:emptyHurdleRecency(),loadCapture:noLoad,loadResults:async()=>new Map(),now:()=>now});
  assert.equal(past.observations.length,0);
  let tick=0;
  const crossed=await runHurdleRecencyCycle({command:"sync",raceDate:date,data:emptyHurdleRecency(),loadCapture:async()=>({meetings:meetings(race()),historyByHorse:history()}),loadResults:async()=>new Map(),now:()=>tick++===0?now:after});
  assert.equal(crossed.observations.length,0);
});

test("sync freezes only once through the real cycle boundary", async () => {
  const cycle=(data:HurdleRecencyData)=>runHurdleRecencyCycle({command:"sync",raceDate:date,data,loadCapture:async()=>({meetings:meetings(race()),historyByHorse:history()}),loadResults:async()=>new Map(),now:()=>now});
  const first=await cycle(emptyHurdleRecency()),second=await cycle(first);assert.equal(first.observations.length,6);assert.deepEqual(second,first);
});

test("failed morning refresh's stale-card fallback cannot generate first-capture market odds", () => {
  const old=process.env.RESEARCH_EXISTING_CARDS_DATE;process.env.RESEARCH_EXISTING_CARDS_DATE=date;
  try {
    const data=currentDayProspectiveCapture({status:"ok",raceDate:date,displayDate:date,refreshedAt:now,sportingLifeCurrentCardVersion:"reconciled_v1",meetings:meetings(race())});
    assert.equal(buildHurdleRecencyObservations({meetings:data.meetings,raceDate:date,historyByHorse:history(),capturedAt:now}).length,0);
  } finally {if(old===undefined)delete process.env.RESEARCH_EXISTING_CARDS_DATE;else process.env.RESEARCH_EXISTING_CARDS_DATE=old;}
});

test("directory locking prevents concurrent duplicate saves and rejects a different tracker epoch", async () => {
  const directory=await mkdtemp(join(tmpdir(),"hurdle-recency-")),path=join(directory,"tracker.json");
  try {
    assert.deepEqual(await loadHurdleRecency(path),emptyHurdleRecency());
    await Promise.all([mutateHurdleRecency(d=>appendHurdleRecency(d,observations()),path),mutateHurdleRecency(d=>appendHurdleRecency(d,observations()),path)]);
    const data=await loadHurdleRecency(path);assert.equal(data.observations.length,6);
    assert.equal((JSON.parse(await readFile(path,"utf8")) as HurdleRecencyData).epoch,HURDLE_RECENCY_EPOCH);
    await writeFile(path,JSON.stringify({...data,epoch:"2020-01-01"}));await assert.rejects(loadHurdleRecency(path),/Unsupported/);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test("secondary panel renders empty and populated samples with primary research metrics and expandable details", () => {
  const empty=renderToStaticMarkup(<HurdleRecencyResearchSection data={emptyHurdleRecency()}/>);
  assert.match(empty,/Hurdle Recency \/ Completion Research/);assert.match(empty,/Not a betting signal/);assert.match(empty,/TOO EARLY/);assert.match(empty,/No prospective Hurdle observations/);assert.doesNotMatch(empty,/ROI|P\/L/);
  const populated=renderToStaticMarkup(<HurdleRecencyResearchSection data={settle(captured())}/>);
  assert.match(populated,/Horse a/);assert.match(populated,/RECENT NON-COMPLETERS/);assert.match(populated,/Actual \/ Market expected/);assert.match(populated,/Market probability/);assert.match(populated,/pulled_up/);
});

test("a missing initial market can be captured on its first later valid pre-race sync", async () => {
  const r=race();r.runners[0]!.bookmakerQuotes=[];
  const cycle=(data:HurdleRecencyData)=>runHurdleRecencyCycle({command:"sync",raceDate:date,data,loadCapture:async()=>({meetings:meetings(r),historyByHorse:history(r)}),loadResults:async()=>new Map(),now:()=>now});
  const missing=await cycle(emptyHurdleRecency());assert.equal(missing.observations.length,0);
  r.runners[0]!.bookmakerQuotes=runner("a",5).bookmakerQuotes;
  const first=await cycle(missing);assert.equal(first.observations.length,6);assert.equal(first.observations[0]!.market.medianBookmakerDecimal,5);
});

test("epoch blocks even an otherwise valid same-day pre-race cohort", () => {
  const r=race();r.raceDateTime=new Date("2026-10-16T16:00:00Z");
  const build=(at:Date)=>buildHurdleRecencyObservations({meetings:meetings(r),raceDate:"2026-10-16",historyByHorse:history(r),capturedAt:at});
  assert.equal(build(new Date(new Date(HURDLE_RECENCY_EPOCH).getTime()-1)).length,0);
  assert.equal(build(new Date(HURDLE_RECENCY_EPOCH)).length,6);
});

test("no-history runners remain in the broad cohort, with no invented non-completion", () => {
  const r=race(),h=history(r);h.set("horse-a",[]);r.runners[0]!.metrics!.daysSinceLastRun=null;r.runners[0]!.metrics!.latestRunDate=null;
  const rows=buildHurdleRecencyObservations({meetings:meetings(r),raceDate:date,historyByHorse:h,capturedAt:now});
  assert.equal(rows.length,6);const first=rows[0]!;
  assert.equal(first.features.latestRunCompleted,null);assert.equal(first.features.recentNonCompletionCount,0);assert.equal(first.flags.NO_RECENT_COMPLETION,true);assert.equal(first.flags.LATEST_RUN_PU,false);
});

test("pre-capture non-runners are excluded from the market denominator and observations", () => {
  const r=race();r.runners[0]!.resultStatus="non_runner";
  const rows=observations(r);assert.equal(rows.length,5);assert.equal(rows[0]!.market.marketRank,1);assert.equal(rows[0]!.fieldSize,5);
  assert.ok(Math.abs(rows.reduce((sum,row)=>sum+row.market.normalizedProbability,0)-1)<1e-12);
});

test("no field-size filter: a valid one-runner field can be captured and settled without dividing by zero", () => {
  const r=race();r.runners=[r.runners[0]!];r.actualRunnerCount=1;r.declaredRunnerCount=1;
  const data=captured(r);assert.equal(data.observations.length,1);assert.equal(data.observations[0]!.market.normalizedProbability,1);
  const out=settle(data,result(r)).observations[0]!.outcome!;assert.equal(out.normalizedFinish,0);assert.equal(out.rankImprovement,0);assert.equal(out.winner,true);
});
