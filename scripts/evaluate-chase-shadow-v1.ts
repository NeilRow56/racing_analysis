import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { raceSoftmax, score, type Model } from './diagnose-independent-tissue-feasibility';
const ROOT='/tmp/chase-shadow-v1';
type Runner={raceId:string;runnerId:string;date:string;won:boolean;values:number[];raw:(number|null)[];current:number;priorChase:number;chaseUsable:number;chaseWindow:number;chaseLatest:number|null;chaseBest:number|null;chaseAvg:number|null;reliability:string;usable:number;completion:string;history:number;orRank:number|null;spSettlement:{profitLoss:number}|null};
type Race={raceId:string;date:string;handicap:string;runners:Runner[]};
type Price={raceId:string;capturedAt:string;scheduledOff:string;runners:{runnerId:string;marketPrice:number;outcome:{status:string;profitLoss:number|null}|null}[]};
type Data={races:Race[];names:string[];prices:Price[];[key:string]:unknown};
type Scored=Runner&{probability:number;rank:number};
type ScoredRace=Omit<Race,'runners'>&{runners:Scored[]};
const hash=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
const sum=(a:number[])=>a.reduce((s,v)=>s+v,0);
const mean=(a:number[])=>a.length?sum(a)/a.length:null;
const bands=[0,.1,.15,.2,.3,1.000001];
function vector(r:Runner,names:string[],set:string){
 const fields:Record<string,number|null>=Object.fromEntries(names.map((n,i)=>[n,r.values[i]!]));
 // These are new, separately named representations; cached fields are never overwritten.
 const extra:Record<string,number|null>={or_rank:r.orRank,log_prior_chase:Math.log1p(r.priorChase),chase_usable:r.chaseUsable,jump_usable:r.usable,chase_sufficient:r.chaseWindow>=2?1:0,latest_non_completion:r.completion==='missing'?null:r.completion==='non_completion'?1:0};
 const speed=[r.chaseLatest,r.chaseBest,r.chaseAvg];
 if(set==='A')return {names:[...names],values:[...r.values]};
 if(set==='B'){
  const keep=names.filter(n=>!['latest_jump_speed','best_l3_jump_speed','avg_l3_jump_speed'].some(s=>n===s||n===s+'_missing'));
  for(const [i,n] of ['chase_latest','chase_best_l3','chase_avg_l3'].entries())extra[n]=r.chaseWindow>=2?speed[i]!:null;
  const en=Object.keys(extra);return {names:[...keep,...en,...en.map(n=>n+'_missing')],values:[...keep.map(n=>fields[n]??0),...en.map(n=>extra[n]??0),...en.map(n=>extra[n]===null?1:0)]};
 }
 const keep=['official_rating','trainer_prior_rate','log_trainer_prior_runs','jockey_prior_rate','log_jockey_prior_runs','days_since_run','age','weight_lbs','handicap'];
 const reduced:Record<string,number|null>={...Object.fromEntries(keep.map(n=>[n,fields[n+'_missing']===1?null:fields[n]!])),...extra};
 for(const [i,n] of ['blend_latest','blend_best_l3','blend_avg_l3'].entries()){
  const a=r.raw[i+1]!,b=speed[i]!,w=Math.min(r.chaseUsable/3,1);
  reduced[n]=b===null?a:a===null?b:w*b+(1-w)*a;
  reduced[n+'_chase_missing']=b===null?1:0;
 }
 const en=Object.keys(reduced);return {names:[...en,...en.map(n=>n+'_missing')],values:[...en.map(n=>reduced[n]??0),...en.map(n=>reduced[n]===null?1:0)]};
}
function fit(races:Race[],names:string[],set:string):Model{
 const rows=races.flatMap(r=>r.runners),v=rows.map(r=>vector(r,names,set));const ns=v[0]!.names;
 const means=ns.map((_,j)=>sum(v.map(x=>x.values[j]!))/v.length),scales=ns.map((_,j)=>Math.max(Math.sqrt(sum(v.map(x=>(x.values[j]!-means[j]!)**2))/v.length),1e-6));
 const matrix=v.map(x=>x.values.map((x,j)=>(x-means[j]!)/scales[j]!)),weights=ns.map(()=>0);
 for(let epoch=0;epoch<90;epoch++){
  const g=ns.map(()=>0);let offset=0;
  for(const race of races){const p=raceSoftmax(race.runners.map((_,k)=>sum(weights.map((w,j)=>w*matrix[offset+k]![j]!))));
   race.runners.forEach((r,k)=>{const residual=(r.won?1:0)-p[k]!;for(let j=0;j<g.length;j++)g[j]!+=residual*matrix[offset+k]![j]!;});offset+=race.runners.length;
  }
  const rate=.12/Math.sqrt(1+epoch/10);for(let j=0;j<weights.length;j++)weights[j]!+=rate*(g[j]!/races.length-.02*weights[j]!);
 }
 return {names:ns,means,scales,weights};
}
function predict(races:Race[],names:string[],set:string,model?:Model):ScoredRace[]{return races.map(race=>{
 const p=model?raceSoftmax(race.runners.map(r=>score(model,vector(r,names,set).values))):race.runners.map(r=>r.current);
 const ordered=race.runners.map((r,i)=>({r,p:p[i]!})).sort((a,b)=>b.p-a.p||a.r.runnerId.localeCompare(b.r.runnerId));
 return {...race,runners:race.runners.map((r,i)=>({...r,probability:p[i]!,rank:ordered.findIndex(x=>x.r.runnerId===r.runnerId)+1}))};
});}
function selection(rows:Scored[]){const w=rows.filter(r=>r.won).length,e=sum(rows.map(r=>r.probability)),sp=rows.filter(r=>r.spSettlement);return {selections:rows.length,winners:w,strike:rows.length?w/rows.length:null,expected:e,actualModel:e?w/e:null,spN:sp.length,spROI:mean(sp.map(r=>r.spSettlement!.profitLoss))};}
function calibration(rows:Scored[]){return bands.slice(0,-1).map((lo,i)=>({band:['<10%','10–<15%','15–<20%','20–<30%','30%+'][i],...selection(rows.filter(r=>r.probability>=lo&&r.probability<bands[i+1]!))}));}
function metrics(races:ScoredRace[]){const rows=races.flatMap(r=>r.runners),cal=calibration(rows);return {races:races.length,runners:rows.length,top1:selection(rows.filter(r=>r.rank===1)),top2:selection(rows.filter(r=>r.rank<=2)),top2RaceCapture:mean(races.map(r=>r.runners.some(r=>r.rank<=2&&r.won)?1:0)),logLoss:mean(races.map(r=>-Math.log(Math.max(r.runners.find(r=>r.won)!.probability,1e-12)))),brier:mean(races.map(r=>sum(r.runners.map(r=>(r.probability-(r.won?1:0))**2)))),meanWinnerRank:mean(rows.filter(r=>r.won).map(r=>r.rank)),rankAssociation:mean(races.map(r=>{const n=r.runners.length,w=r.runners.find(r=>r.won)!.rank;return (n+1-2*w)/Math.sqrt((n*n-1)*(n-1)/3); })),ece:rows.length?sum(cal.map(b=>Math.abs(b.winners-b.expected)))/rows.length:null,calibration:cal};}
const mode=process.argv[2];
if(mode==='develop'){
 const data=JSON.parse(await readFile(`${ROOT}/2025.json`,'utf8')) as Data;
 const train=data.races.filter(r=>r.date<'2025-10-01'),valid=data.races.filter(r=>r.date>='2025-10-01');
 const candidates=['A','B','C'].map(set=>{const model=fit(train,data.names,set);return {set,features:model.names.length,train:metrics(predict(train,data.names,set,model)),validation:metrics(predict(valid,data.names,set,model)),months:['10','11','12'].map(m=>({month:m,...metrics(predict(valid.filter(r=>r.date.slice(5,7)===m),data.names,set,model))}))};});
 const min=Math.min(...candidates.map(c=>c.validation.logLoss!));
 const selected=candidates.filter(c=>c.validation.logLoss!<=min+.005).sort((a,b)=>a.validation.ece!-b.validation.ece!||b.validation.top2RaceCapture!-a.validation.top2RaceCapture!||a.features-b.features)[0]!;
 const model=fit(data.races,data.names,selected.set);
 const content={version:'CHASE_SHADOW_V1',set:selected.set,frozenAt:new Date().toISOString(),trainingPeriod:'2025-01-01/2025-12-31',developmentTrain:'2025-01-01/2025-09-30',validation:'2025-10-01/2025-12-31',protocol:JSON.parse(await readFile(`${ROOT}/protocol.json`,'utf8')),developmentDataHash:hash(await readFile(`${ROOT}/2025.json`)),codeHashes:Object.fromEntries(await Promise.all(['scripts/extract-chase-shadow-v1.ts','scripts/evaluate-chase-shadow-v1.ts'].map(async p=>[p,hash(await readFile(p))]))),model};
 await writeFile(`${ROOT}/development.json`,JSON.stringify(candidates,null,2),{flag:'wx'});
 await writeFile(`${ROOT}/frozen.json`,JSON.stringify({...content,checksum:hash(JSON.stringify(content))},null,2),{flag:'wx'});
 console.log(JSON.stringify({selected:selected.set,features:model.names.length,candidates:candidates.map(c=>({set:c.set,logLoss:c.validation.logLoss,ece:c.validation.ece,top1:c.validation.top1.strike,top2:c.validation.top2RaceCapture}))},null,2));
}else if(mode==='holdout'){
 const frozen=JSON.parse(await readFile(`${ROOT}/frozen.json`,'utf8'));const {checksum,...content}=frozen;if(hash(JSON.stringify(content))!==checksum)throw Error('Freeze checksum mismatch');
 for(const [path,expected] of Object.entries(frozen.codeHashes))if(hash(await readFile(path))!==expected)throw Error('Code changed after freeze');
 const data=JSON.parse(await readFile(`${ROOT}/2026.json`,'utf8')) as Data;
 const current=predict(data.races,data.names,'A'),shadow=predict(data.races,data.names,frozen.set,frozen.model);
 const populations=(rs:ScoredRace[])=>({overall:metrics(rs),quarters:['01-03','04-06','07-09','10-12'].map(q=>({period:q,...metrics(rs.filter(r=>r.date.slice(5,7)>=q.slice(0,2)&&r.date.slice(5,7)<=q.slice(3)))})),handicap:['handicap','non_handicap','unknown'].map(h=>({group:h,...metrics(rs.filter(r=>r.handicap===h))})),contexts:Object.fromEntries(['reliability','orRank','completion','priorChase'].map(key=>{
 const group=(r:Scored)=>key==='orRank'?r.orRank===null?'missing':r.orRank===1?'1':r.orRank<=3?'2-3':'4+':key==='priorChase'?r.priorChase===0?'0':r.priorChase<=2?'1-2':'3+':String(r[key as 'reliability'|'completion']);
 const all=rs.flatMap(r=>r.runners);return [key,[...new Set(all.map(group))].sort().map(g=>({group:g,all:selection(all.filter(r=>group(r)===g)),top1:selection(all.filter(r=>group(r)===g&&r.rank===1)),top2:selection(all.filter(r=>group(r)===g&&r.rank<=2)),runnerLogLoss:mean(all.filter(r=>group(r)===g).map(r=>-(r.won?Math.log(r.probability):Math.log1p(-Math.min(r.probability,1-1e-12)))))}))];})),prices:priceMetrics(rs,data.prices)});
 function priceMetrics(rs:ScoredRace[],books:Price[]){const prices=new Map(books.map(b=>[b.raceId,b]));const rows=rs.flatMap(r=>r.runners.filter(x=>x.rank<=2).map(x=>({x,q:prices.get(r.raceId)?.runners.find(q=>q.runnerId===x.runnerId)}))).filter((x):x is {x:Scored;q:Price['runners'][number]}=>x.q?.outcome?.status==='settled'&&x.q.outcome.profitLoss!==null);return {all:{n:rows.length,winners:rows.filter(r=>r.x.won).length,roi:mean(rows.map(r=>r.q.outcome!.profitLoss!))},over6:{n:rows.filter(r=>r.q.marketPrice>6).length,winners:rows.filter(r=>r.q.marketPrice>6&&r.x.won).length,roi:mean(rows.filter(r=>r.q.marketPrice>6).map(r=>r.q.outcome!.profitLoss!))},comparableRaceIds:rs.filter(r=>prices.has(r.raceId)).map(r=>r.raceId)};}
 const disagreement=[true,false].map(diff=>{const ids=new Set(current.filter((r,i)=>(r.runners.find(x=>x.rank===1)!.runnerId!==shadow[i]!.runners.find(x=>x.rank===1)!.runnerId)===diff).map(r=>r.raceId));return {disagree:diff,current:metrics(current.filter(r=>ids.has(r.raceId))),shadow:metrics(shadow.filter(r=>ids.has(r.raceId)))};});
 await writeFile(`${ROOT}/holdout.json`,JSON.stringify({frozenChecksum:checksum,holdoutHash:hash(await readFile(`${ROOT}/2026.json`)),current:populations(current),shadow:populations(shadow),disagreement},null,2),{flag:'wx'});
 await writeFile(`${ROOT}/predictions.json`,JSON.stringify({current,shadow}));
 console.log(JSON.stringify({current:metrics(current),shadow:metrics(shadow)},null,2));
}else throw Error('Use develop or holdout');
