/** Read-only research export. Development and holdout are deliberately separate invocations. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDbConnection } from '@/db';
import { loadLatestBacktestFeatureCacheForYear } from '@/lib/racing/backtest-cache';
import { classifyJumpRaceSubtype, isJumpRace } from '@/lib/racing/jump-speed-rating';
import { getJumpSpeedRatingsAsOfRuns } from '@/lib/racing/jump-speed-ratings';
import { assessJumpSpeedReliability } from '@/lib/racing/jump-speed-reliability';
import { calculateHorseMetricsAsOf, type HistoricalRunInput } from '@/lib/racing/horse-metrics';
import { isVoidBetResultStatus, settledWinValue, settleSelection } from '@/lib/racing/backtest';
import { JUMP_TISSUE_FEATURE_NAMES, loadJumpTissueModel } from '@/lib/racing/jump-tissue-model';
import { descendingRanks } from '@/lib/racing/descending-ranks';
import { classifyHandicapStatus } from '@/lib/racing/research-rule';
import { commentVector, priorCommentsForTarget, raceSoftmax, score, type HistoricalComment } from './diagnose-independent-tissue-feasibility';
import { CHASE_VALUE_CONFIG } from '@/lib/racing/tissue-value-config';
import { loadValueForward, validValueCapture } from '@/lib/racing/tissue-value-forward';
const year=process.argv[2];
if(year!=='2025'&&year!=='2026') throw Error('Specify 2025 or 2026');
if(year==='2026') await readFile('/tmp/chase-shadow-v1/frozen.json');
const cache=await loadLatestBacktestFeatureCacheForYear({year,family:'jump',...(year==='2026'?{outputDir:'/tmp/chase-non-summer-cache'}:{})});
if(!cache) throw Error('No compatible cache');
const rows=cache.rows.filter(r=>classifyJumpRaceSubtype(r.features)==='chase');
const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('options','-c default_transaction_read_only=on');
const {client,db}=createDbConnection(url.toString());
const hash=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
type Run=HistoricalRunInput & {runnerId:string;raceTypeCode:string|null;winningTime:string|null};
try {
 await client`SET default_transaction_read_only=on`;
 const ro=await client`select current_setting('transaction_read_only') as ro`;if(ro[0]!.ro!=='on')throw Error('Read only required');
 const ids=[...new Set(rows.map(r=>r.features.horseId))];
 const history=await client<Run[]>`select rr.id as "runnerId",rr.horse_id as "horseId",r.race_datetime as "raceDateTime",r.race_date::text as "raceDate",r.race_name as "raceName",r.race_type as "raceType",r.race_type_code as "raceTypeCode",r.course_id as "courseId",r.distance_yards as "distanceYards",r.going,rr.finishing_position as "finishingPosition",rr.result_status as "resultStatus",rr.racing_post_rating as "racingPostRating",rr.topspeed_rating as "topspeedRating",rr.official_rating as "officialRating",rr.weight_carried_lbs as "weightCarriedLbs",r.winning_time as "winningTime" from race_runners rr join races r on r.id=rr.race_id where rr.horse_id in ${client(ids)} and rr.source='sporting_life' and r.source='sporting_life' and r.race_datetime < ${year==='2025'?'2026-01-01':'2026-10-30'} order by r.race_datetime desc,rr.id`;
 const comments=await client<Array<HistoricalComment&{horseId:string}>>`select rr.horse_id as "horseId",r.id as "raceId",r.race_datetime as "raceDateTime",r.race_date::text as "raceDate",rr.runner_comment as comment from race_runners rr join races r on r.id=rr.race_id where rr.horse_id in ${client(ids)} and r.source='sporting_life' and rr.runner_comment is not null and btrim(rr.runner_comment)<>'' and coalesce(rr.result_status,'')<>'non_runner' and r.race_datetime < ${year==='2025'?'2026-01-01':'2026-10-30'} order by r.race_datetime`;
 for(const h of history)h.raceDateTime=new Date(h.raceDateTime);
 for(const c of comments)c.raceDateTime=new Date(c.raceDateTime);
 const byHorse=Map.groupBy(history,h=>h.horseId),byComment=Map.groupBy(comments,h=>h.horseId);
 const priors=rows.map(r=>(byHorse.get(r.features.horseId)??[]).filter(h=>new Date(h.raceDateTime)<r.features.raceDateTime&&h.resultStatus!=='non_runner'&&(h.resultStatus!==null||h.finishingPosition!==null)));
 const eligible=priors.map(h=>h.filter(h=>h.winningTime?.trim()));
 const speedIds=[...new Set(eligible.flatMap(h=>[...h.slice(0,3),...h.filter(h=>classifyJumpRaceSubtype(h)==='chase').slice(0,3)]).filter(isJumpRace).map(h=>h.runnerId))];
 console.log(year,'as-of speed targets',speedIds.length);
 const speeds=await getJumpSpeedRatingsAsOfRuns(db,speedIds);
 for(const h of history)h.jumpSpeedRating=speeds.get(h.runnerId)??null;
 const model=await loadJumpTissueModel();
 const enriched=rows.map((row,i)=>{
  const f=row.features,h=eligible[i]!,ch=h.filter(h=>classifyJumpRaceSubtype(h)==='chase'),all=priors[i]!;
  const cm=calculateHorseMetricsAsOf({runs:ch,beforeDateTime:f.raceDateTime});
  const raw=[f.officialRating,f.latestJumpSpeedRating,f.bestJumpSpeedLast3,f.averageJumpSpeedLast3,f.trainerPriorWinRate,Math.log1p(f.trainerPriorRuns),f.jockeyPriorWinRate??null,Math.log1p(f.jockeyPriorRuns??0),f.daysSinceLastRun,Math.log1p(f.priorRuns),f.horseAge,f.weightCarriedLbs,Number(f.raceClass?.match(/\d+/)?.[0])||null,f.distanceYards===null?null:f.distanceYards/220,f.actualRunnerCount??f.declaredRunnerCount,/handicap/i.test(`${f.raceName??''} ${f.raceType??''}`)?1:0,/soft|heavy/i.test(f.going??'')?1:0,/firm/i.test(f.going??'')?1:0];
  const numeric=[...raw.map(v=>v??0),...raw.map(v=>v===null?1:0)];
  const values=[...numeric,...commentVector(priorCommentsForTarget(byComment.get(f.horseId)??[],f.raceDateTime))];
  const latest=all[0];
  const completion=latest?(latest.finishingPosition!==null?'completed':latest.resultStatus&&latest.resultStatus!=='finished'&&!isVoidBetResultStatus(latest.resultStatus)?'non_completion':'missing'):'missing';
  return {raceId:f.targetRaceId,runnerId:f.targetRunnerId,date:f.raceDate,won:settledWinValue(row.outcome),outcome:row.outcome,actualCount:f.actualRunnerCount,handicap:classifyHandicapStatus(f),or:f.officialRating,values,raw,priorChase:all.filter(h=>classifyJumpRaceSubtype(h)==='chase').length,chaseWindow:ch.length,chaseUsable:ch.slice(0,3).filter(h=>h.jumpSpeedRating!==null).length,chaseLatest:cm.latestJumpSpeedRating,chaseBest:cm.bestJumpSpeedLast3,chaseAvg:cm.averageJumpSpeedLast3,reliability:assessJumpSpeedReliability(h.slice(0,3)).level,usable:assessJumpSpeedReliability(h.slice(0,3)).relevantJumpRuns,completion,history:all.length};
 });
 const exclusions:Record<string,number>={};const races=[];
 for(const [raceId,field] of Map.groupBy(enriched,r=>r.raceId)){
  const ranks=descendingRanks(field.map(r=>({...r,runnerId:r.runnerId})),r=>r.or);
  const active=field.filter(r=>!isVoidBetResultStatus(r.outcome.resultStatus));
  const reason=active.length<2?'small_field':active.some(r=>r.won===null)?'unsettled':active.filter(r=>r.won).length!==1?'not_single_winner':(active[0]!.actualCount!==active.length&&active[0]!.actualCount!==field.length)?'incomplete_field':null;
  if(reason){exclusions[reason]=(exclusions[reason]??0)+1;continue;}
  const p=raceSoftmax(active.map(r=>score(model.model,r.values)));
  races.push({raceId,date:active[0]!.date,handicap:active[0]!.handicap,runners:active.map((r,i)=>({...r,current:p[i],orRank:ranks.get(r.runnerId)??null,spSettlement:settleSelection(r.outcome)}))});
 }
 const prices=year==='2026'?(await loadValueForward(CHASE_VALUE_CONFIG)).races.filter(r=>validValueCapture(r,CHASE_VALUE_CONFIG)):[];
 const sourceHashes:Record<string,string>={};for(const name of ['manifest.json','features.ndjson','outcomes.ndjson'])sourceHashes[name]=hash(await readFile(`${cache.directory}/${name}`));
 const out={year,cache:cache.directory,manifest:cache.manifest,sourceHashes,historyHash:hash(JSON.stringify(history)),commentsHash:hash(JSON.stringify(comments)),modelChecksum:model.checksum,names:JUMP_TISSUE_FEATURE_NAMES,exclusions,races,prices,readOnly:ro[0]!.ro};
 await writeFile(`/tmp/chase-shadow-v1/${year}.json`,JSON.stringify(out));
 console.log(year,'exported',races.length,'races',races.reduce((s,r)=>s+r.runners.length,0),'runners',exclusions);
} finally {await client.end();}
